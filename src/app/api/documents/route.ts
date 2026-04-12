import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestProducts } from "@/lib/rag/ingest-products";

// Allow up to 120s for full re-embed
export const maxDuration = 120;

/**
 * GET /api/documents?source_type=product_spec
 * Returns document stats and list of indexed sources.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sourceType = searchParams.get("source_type");

  const supabase = createAdminClient();

  // Get stats per source_type
  let query = supabase
    .from("documents" as "products")
    .select("source_type, source_id, title, chunk_index, token_count, updated_at, content_hash");

  if (sourceType) {
    query = query.eq("source_type", sourceType);
  }

  const { data, error } = await query as {
    data: {
      source_type: string;
      source_id: string;
      title: string;
      chunk_index: number;
      token_count: number | null;
      updated_at: string;
      content_hash: string;
    }[] | null;
    error: unknown;
  };

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
    return {
      source_type: type,
      source_id: id,
      title: chunks[0]?.title ?? id,
      chunks: chunks.length,
      total_tokens: chunks.reduce((s, c) => s + (c.token_count ?? 0), 0),
      last_updated: chunks.reduce((latest, c) =>
        !latest || c.updated_at > latest ? c.updated_at : latest, "" as string),
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
  const body = await request.json();
  const { action, source_type, model, product_line_id, force } = body as {
    action: string;
    source_type: string;
    model?: string;
    product_line_id?: string;
    force?: boolean;
  };

  if (action !== "ingest") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

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

  // Future source types: gitbook, web, google_doc, file, text_snippet
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
