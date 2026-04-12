import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbeddings, contentHash, estimateTokens } from "./embeddings";

interface ProductRow {
  id: string;
  model_name: string;
  full_name: string;
  subtitle: string;
  overview: string;
  features: string[];
  status: string;
  product_line_id: string;
}

interface SpecSectionRow {
  category: string;
  sort_order: number;
  spec_items: { label: string; value: string; sort_order: number }[];
}

interface ProductLineRow {
  id: string;
  name: string;
  label: string;
  category: string;
}

/**
 * Build the "overview" chunk: product name, subtitle, overview, features.
 * This chunk captures what the product IS and what it does.
 */
function buildOverviewChunk(
  product: ProductRow,
  productLine: ProductLineRow
): string {
  const lines = [
    `${product.model_name} — ${product.full_name}`,
    `Product Line: ${productLine.label} (${productLine.category})`,
    `Status: ${product.status}`,
  ];

  if (product.subtitle) {
    lines.push(`Subtitle: ${product.subtitle}`);
  }

  if (product.overview) {
    lines.push("", "Overview:", product.overview);
  }

  if (product.features?.length > 0) {
    lines.push("", "Key Features:");
    for (const f of product.features) {
      lines.push(`• ${f}`);
    }
  }

  return lines.join("\n");
}

/**
 * Build the "specifications" chunk: full spec table in text format.
 * This chunk captures the detailed technical specs.
 */
function buildSpecsChunk(
  product: ProductRow,
  specs: SpecSectionRow[]
): string {
  const lines = [
    `${product.model_name} — Technical Specifications`,
    "",
  ];

  const sorted = [...specs].sort((a, b) => a.sort_order - b.sort_order);

  for (const section of sorted) {
    lines.push(`[${section.category}]`);
    const items = [...section.spec_items].sort((a, b) => a.sort_order - b.sort_order);
    for (const item of items) {
      lines.push(`  ${item.label}: ${item.value}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Ingest all products (or a specific product) into the documents table.
 * Generates two chunks per product: overview + specifications.
 *
 * Returns { processed, skipped, errors } counts.
 */
export async function ingestProducts(options?: {
  modelName?: string;
  productLineId?: string;
  force?: boolean; // re-embed even if content unchanged
}): Promise<{ processed: number; skipped: number; errors: string[] }> {
  const supabase = createAdminClient();
  const errors: string[] = [];

  // Fetch products
  let query = supabase
    .from("products")
    .select("id, model_name, full_name, subtitle, overview, features, status, product_line_id");

  if (options?.modelName) {
    query = query.eq("model_name", options.modelName);
  }
  if (options?.productLineId) {
    query = query.eq("product_line_id", options.productLineId);
  }

  const { data: products, error: prodError } = await query as {
    data: ProductRow[] | null;
    error: unknown;
  };

  if (prodError || !products) {
    return { processed: 0, skipped: 0, errors: [`Failed to fetch products: ${prodError}`] };
  }

  // Fetch all product lines for metadata
  const { data: productLines } = await supabase
    .from("product_lines")
    .select("id, name, label, category") as { data: ProductLineRow[] | null };

  const plMap = new Map((productLines ?? []).map((pl) => [pl.id, pl]));

  // Fetch existing document hashes to skip unchanged
  const sourceIds = products.map((p) => p.model_name);
  const { data: existingDocs } = await supabase
    .from("documents" as "products")
    .select("source_id, chunk_index, content_hash")
    .eq("source_type", "product_spec")
    .in("source_id", sourceIds) as {
    data: { source_id: string; chunk_index: number; content_hash: string }[] | null;
  };

  const hashMap = new Map<string, string>();
  for (const doc of existingDocs ?? []) {
    hashMap.set(`${doc.source_id}:${doc.chunk_index}`, doc.content_hash);
  }

  // Build chunks for all products
  const chunksToEmbed: {
    product: ProductRow;
    productLine: ProductLineRow;
    chunkIndex: number;
    content: string;
    title: string;
    hash: string;
  }[] = [];

  let skipped = 0;

  for (const product of products) {
    const pl = plMap.get(product.product_line_id);
    if (!pl) {
      errors.push(`${product.model_name}: product line not found`);
      continue;
    }

    // Fetch specs for this product
    const { data: specs } = await supabase
      .from("spec_sections")
      .select("category, sort_order, spec_items (label, value, sort_order)")
      .eq("product_id", product.id)
      .order("sort_order") as { data: SpecSectionRow[] | null };

    // Chunk 0: Overview
    const overviewContent = buildOverviewChunk(product, pl);
    const overviewHash = contentHash(overviewContent);

    if (!options?.force && hashMap.get(`${product.model_name}:0`) === overviewHash) {
      skipped++;
    } else {
      chunksToEmbed.push({
        product,
        productLine: pl,
        chunkIndex: 0,
        content: overviewContent,
        title: `${product.model_name} — ${product.full_name}`,
        hash: overviewHash,
      });
    }

    // Chunk 1: Specifications (only if specs exist)
    if (specs && specs.length > 0) {
      const specsContent = buildSpecsChunk(product, specs);
      const specsHash = contentHash(specsContent);

      if (!options?.force && hashMap.get(`${product.model_name}:1`) === specsHash) {
        skipped++;
      } else {
        chunksToEmbed.push({
          product,
          productLine: pl,
          chunkIndex: 1,
          content: specsContent,
          title: `${product.model_name} — Technical Specifications`,
          hash: specsHash,
        });
      }
    }
  }

  if (chunksToEmbed.length === 0) {
    return { processed: 0, skipped, errors };
  }

  // Generate embeddings in batches of 20 (conservative to avoid token limits)
  const BATCH_SIZE = 20;
  // Truncate very long texts to ~6000 tokens (~21000 chars) to stay under API limit
  const MAX_CHARS = 21000;
  let processed = 0;

  for (let i = 0; i < chunksToEmbed.length; i += BATCH_SIZE) {
    const batch = chunksToEmbed.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) =>
      c.content.length > MAX_CHARS ? c.content.slice(0, MAX_CHARS) : c.content
    );

    let embeddings: number[][];
    try {
      embeddings = await generateEmbeddings(texts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Embedding batch ${i / BATCH_SIZE + 1} (${batch.length} chunks) failed: ${msg}`);
      continue;
    }

    // Upsert documents with embeddings
    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j];
      const embedding = embeddings[j];

      const { error: upsertError } = await supabase
        .from("documents" as "products")
        .upsert(
          {
            source_type: "product_spec",
            source_id: chunk.product.model_name,
            source_url: `/product/${chunk.product.model_name}`,
            title: chunk.title,
            chunk_index: chunk.chunkIndex,
            content: chunk.content,
            token_count: estimateTokens(chunk.content),
            metadata: {
              product_line: chunk.productLine.name,
              product_line_label: chunk.productLine.label,
              category: chunk.productLine.category,
              status: chunk.product.status,
              chunk_type: chunk.chunkIndex === 0 ? "overview" : "specifications",
            },
            embedding: `[${embedding.join(",")}]`,
            content_hash: chunk.hash,
            updated_at: new Date().toISOString(),
          } as Record<string, unknown>,
          { onConflict: "source_type,source_id,chunk_index" }
        );

      if (upsertError) {
        errors.push(`${chunk.product.model_name} chunk ${chunk.chunkIndex}: ${JSON.stringify(upsertError)}`);
      } else {
        processed++;
      }
    }
  }

  return { processed, skipped, errors };
}
