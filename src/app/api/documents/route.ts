import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gate } from "@/lib/auth/session";
import { ingestProducts } from "@/lib/rag/ingest-products";
import { ingestGitbook } from "@/lib/rag/ingest-gitbook";
import { ingestHelpcenter } from "@/lib/rag/ingest-helpcenter";
import { ingestGoogleDoc } from "@/lib/rag/ingest-google-doc";
import { ingestWifiRegulations } from "@/lib/rag/ingest-wifi-regulations";
import { fetchGoogleDoc } from "@/lib/google/docs";
import { normalizeTaxonomy, type TaxonomyMeta } from "@/lib/rag/taxonomy";

// Allow up to 300s for Gitbook ingestion (many pages + Vision API)
export const maxDuration = 300;

/**
 * GET /api/documents?source_type=product_spec
 * Returns document stats and list of indexed sources.
 */
export async function GET(request: Request) {
  const denied = await gate("knowledge.view");
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const sourceType = searchParams.get("source_type");

  const supabase = createAdminClient();

  // Get stats per source_type.
  //
  // Supabase/PostgREST has a server-side row cap (default 1000) that overrides
  // any client-side `.limit()`. To reliably fetch the full documents index
  // regardless of how many chunks exist, paginate with `.range()` until the
  // batch is smaller than the page size.
  type DocRow = {
    source_type: string;
    source_id: string;
    title: string;
    chunk_index: number;
    token_count: number | null;
    updated_at: string;
    content_hash: string;
    metadata: Record<string, unknown> | null;
  };

  const PAGE_SIZE = 1000;
  const MAX_PAGES = 50; // hard safety stop at 50000 rows
  const allRows: DocRow[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    let pageQuery = supabase
      .from("documents" as "products")
      .select("source_type, source_id, title, chunk_index, token_count, updated_at, content_hash, metadata")
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (sourceType) {
      pageQuery = pageQuery.eq("source_type", sourceType);
    }

    const { data: pageData, error: pageError } = await pageQuery as {
      data: DocRow[] | null;
      error: unknown;
    };

    if (pageError) {
      return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
    }

    const batch = pageData ?? [];
    allRows.push(...batch);

    if (batch.length < PAGE_SIZE) break;
  }

  const data = allRows;
  const error = null;

  if (error) {
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }

  const docs = data ?? [];

  // Group by source_type for stats
  const stats: Record<string, { count: number; sources: number; total_tokens: number; last_updated: string | null }> = {};

  const sourceSet = new Map<string, Set<string>>();

  for (const doc of docs) {
    if (!stats[doc.source_type]) {
      stats[doc.source_type] = { count: 0, sources: 0, total_tokens: 0, last_updated: null };
      sourceSet.set(doc.source_type, new Set());
    }
    stats[doc.source_type].count++;
    stats[doc.source_type].total_tokens += doc.token_count ?? 0;
    sourceSet.get(doc.source_type)!.add(doc.source_id);

    if (!stats[doc.source_type].last_updated || doc.updated_at > stats[doc.source_type].last_updated!) {
      stats[doc.source_type].last_updated = doc.updated_at;
    }
  }

  for (const [type, set] of sourceSet) {
    stats[type].sources = set.size;
  }

  // Build source list (grouped by source_id)
  const sources = [...new Set(docs.map((d) => `${d.source_type}:${d.source_id}`))].map((key) => {
    const [type, id] = key.split(":", 2);
    const chunks = docs.filter((d) => d.source_type === type && d.source_id === id);
    const meta = chunks[0]?.metadata as Record<string, unknown> | null;
    return {
      source_type: type,
      source_id: id,
      title: chunks[0]?.title ?? id,
      chunks: chunks.length,
      total_tokens: chunks.reduce((s, c) => s + (c.token_count ?? 0), 0),
      last_updated: chunks.reduce((latest, c) =>
        !latest || c.updated_at > latest ? c.updated_at : latest, "" as string),
      product_line: (meta?.product_line_label as string) ?? (meta?.product_line as string) ?? null,
      space_label: (meta?.space_label as string) ?? null,
      space_url: (meta?.space_url as string) ?? null,
      helpcenter_label: (meta?.helpcenter_label as string) ?? null,
      collection: (meta?.collection as string) ?? null,
      doc_label: (meta?.doc_label as string) ?? null,
      tab_name: (meta?.tab_name as string) ?? null,
      // Unified taxonomy fields
      solution: (meta?.solution as string) ?? null,
      product_lines: Array.isArray(meta?.product_lines) ? (meta?.product_lines as string[]) : [],
      models: Array.isArray(meta?.models) ? (meta?.models as string[]) : [],
    };
  });

  return NextResponse.json({ ok: true, stats, sources, total: docs.length });
}

/**
 * POST /api/documents
 * Trigger ingestion for a source type.
 * Body: { action: 'ingest', source_type: 'product_spec', model?: string, product_line_id?: string, force?: boolean }
 */
export async function POST(request: Request) {
  const denied = await gate("knowledge.edit");
  if (denied) return denied;
  const body = await request.json();
  const {
    action,
    source_type,
    model,
    product_line_id,
    force,
    taxonomy: taxonomyInput,
  } = body as {
    action: string;
    source_type: string;
    model?: string;
    product_line_id?: string;
    force?: boolean;
    taxonomy?: Partial<TaxonomyMeta>;
  };

  if (action !== "ingest") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const taxonomy = normalizeTaxonomy(taxonomyInput);

  if (source_type === "product_spec") {
    const result = await ingestProducts({
      modelName: model,
      productLineId: product_line_id,
      force,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  }

  if (source_type === "gitbook") {
    const { space_url, space_label, enable_vision } = body as {
      space_url?: string;
      space_label?: string;
      enable_vision?: boolean;
    };

    if (!space_url) {
      return NextResponse.json(
        { error: "Missing space_url for gitbook ingestion" },
        { status: 400 }
      );
    }

    const result = await ingestGitbook({
      spaceUrl: space_url,
      spaceLabel: space_label || space_url,
      force,
      enableVision: enable_vision ?? true,
      taxonomy,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  }

  if (source_type === "helpcenter") {
    const { collection_urls, article_urls, label: hcLabel } = body as {
      collection_urls?: string[];
      article_urls?: string[];
      label?: string;
    };

    if (!collection_urls?.length && !article_urls?.length) {
      return NextResponse.json(
        { error: "Missing collection_urls or article_urls for helpcenter ingestion" },
        { status: 400 }
      );
    }

    const result = await ingestHelpcenter({
      collectionUrls: collection_urls || [],
      articleUrls: article_urls,
      label: hcLabel || "Help Center",
      force,
      taxonomy,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  }

  if (source_type === "google_doc") {
    const { label: docLabel, doc_url } = body as {
      label?: string;
      doc_url?: string;
    };
    let { doc_id, content, doc_title } = body as {
      doc_id?: string;
      content?: string;
      doc_title?: string;
    };

    // Extract doc ID from URL if not provided directly
    if (!doc_id && doc_url) {
      const idMatch = doc_url.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (idMatch) doc_id = idMatch[1];
    }

    if (!doc_id) {
      return NextResponse.json(
        { error: "Missing doc_id or doc_url for google_doc ingestion" },
        { status: 400 }
      );
    }

    // If no content provided, fetch via Drive API (service account → public export fallback)
    if (!content) {
      try {
        const fetched = await fetchGoogleDoc(doc_id);
        content = fetched.content;
        if (!doc_title) doc_title = fetched.title;
      } catch (err) {
        return NextResponse.json(
          { error: `Failed to fetch Google Doc: ${err instanceof Error ? err.message : String(err)}` },
          { status: 400 }
        );
      }
    }

    if (!content || content.trim().length < 100) {
      return NextResponse.json({ error: "Document content is empty or too short" }, { status: 400 });
    }

    const result = await ingestGoogleDoc({
      docId: doc_id,
      content,
      docTitle: doc_title || "Untitled Document",
      label: docLabel,
      docUrl: doc_url || `https://docs.google.com/document/d/${doc_id}`,
      force,
      taxonomy,
    });

    return NextResponse.json({ ok: true, ...result });
  }

  if (source_type === "wifi_regulation") {
    const { country_codes } = body as { country_codes?: string[] };
    try {
      const result = await ingestWifiRegulations({
        force,
        countryCodes: country_codes,
        taxonomy,
      });
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      return NextResponse.json(
        { error: `WiFi regulation ingest failed: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 }
      );
    }
  }

  // Future source types: web, file, text_snippet
  return NextResponse.json(
    { error: `Source type "${source_type}" ingestion not yet implemented` },
    { status: 400 }
  );
}

/**
 * DELETE /api/documents
 * Remove documents by source_type and optionally source_id.
 * Body: { source_type: string, source_id?: string }
 */
export async function DELETE(request: Request) {
  const denied = await gate("knowledge.edit");
  if (denied) return denied;
  const body = await request.json();
  const { source_type, source_id } = body as {
    source_type: string;
    source_id?: string;
  };

  if (!source_type) {
    return NextResponse.json({ error: "Missing source_type" }, { status: 400 });
  }

  const supabase = createAdminClient();

  let query = supabase
    .from("documents" as "products")
    .delete()
    .eq("source_type", source_type);

  if (source_id) {
    query = query.eq("source_id", source_id);
  }

  const { error } = await query;

  if (error) {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/documents
 * Update taxonomy metadata (solution / product_lines / models) for all chunks
 * belonging to a given source, without re-running ingestion.
 * Body: { source_type: string, source_id: string, taxonomy: Partial<TaxonomyMeta> }
 */
export async function PATCH(request: Request) {
  const denied = await gate("knowledge.edit");
  if (denied) return denied;
  const body = await request.json();
  const { source_type, source_id, taxonomy: taxonomyInput } = body as {
    source_type: string;
    source_id: string;
    taxonomy?: Partial<TaxonomyMeta>;
  };

  if (!source_type || !source_id) {
    return NextResponse.json(
      { error: "Missing source_type or source_id" },
      { status: 400 }
    );
  }

  const taxonomy = normalizeTaxonomy(taxonomyInput);
  const supabase = createAdminClient();

  // Fetch existing rows to merge metadata (preserve other keys)
  const { data: existing, error: fetchErr } = await supabase
    .from("documents" as "products")
    .select("id, metadata")
    .eq("source_type", source_type)
    .eq("source_id", source_id) as {
      data: { id: string; metadata: Record<string, unknown> | null }[] | null;
      error: unknown;
    };

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Failed to fetch existing rows" }, { status: 500 });
  }

  if (existing.length === 0) {
    return NextResponse.json({ error: "No matching documents found" }, { status: 404 });
  }

  // Merge taxonomy fields into each row's metadata
  let updated = 0;
  for (const row of existing) {
    const newMeta = {
      ...(row.metadata ?? {}),
      solution: taxonomy.solution,
      product_lines: taxonomy.product_lines,
      models: taxonomy.models,
    };

    const { error: updateErr } = await supabase
      .from("documents" as "products")
      .update({ metadata: newMeta, updated_at: new Date().toISOString() } as Record<string, unknown>)
      .eq("id", row.id);

    if (!updateErr) updated++;
  }

  return NextResponse.json({ ok: true, updated });
}
