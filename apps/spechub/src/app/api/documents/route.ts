import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate } from "@eg/auth/session";
import { ingestProducts } from "@/lib/rag/ingest-products";
import { ingestGitbook } from "@/lib/rag/ingest-gitbook";
import { ingestHelpcenter } from "@/lib/rag/ingest-helpcenter";
import { ingestGoogleDoc } from "@/lib/rag/ingest-google-doc";
import { ingestWifiRegulations } from "@/lib/rag/ingest-wifi-regulations";
import { ingestWeb } from "@/lib/rag/ingest-web";
import { ingestTextSnippet } from "@/lib/rag/ingest-text-snippet";
import { fetchGoogleDoc } from "@/lib/google/docs";
import { normalizeTaxonomy, type TaxonomyMeta } from "@/lib/rag/taxonomy";

/** Colon-free, stable source_id for a new text snippet (GET splits on ":"). */
function snippetSourceId(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const rand = Math.random().toString(36).slice(2, 8);
  return `snippet-${slug || "note"}-${rand}`;
}

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

  // Raw-fetch mode: return a single source's editable content (used by the
  // Text Snippet editor to reload the raw markdown from chunk 0's metadata).
  const rawSourceId = searchParams.get("raw") ? searchParams.get("source_id") : null;
  if (rawSourceId && sourceType) {
    const supabaseRaw = createAdminClient();
    const { data: row } = (await supabaseRaw
      .from("documents" as "products")
      .select("title, metadata")
      .eq("source_type", sourceType)
      .eq("source_id", rawSourceId)
      .eq("chunk_index", 0)
      .maybeSingle()) as { data: { title: string; metadata: Record<string, unknown> | null } | null };
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const meta = row.metadata ?? {};
    return NextResponse.json({
      ok: true,
      source_id: rawSourceId,
      title: (meta.snippet_title as string) ?? row.title,
      content: (meta.raw as string) ?? "",
      label: (meta.snippet_label as string) ?? "",
      taxonomy: {
        solution: (meta.solution as string) ?? null,
        product_lines: Array.isArray(meta.product_lines) ? meta.product_lines : [],
        models: Array.isArray(meta.models) ? meta.models : [],
      },
    });
  }

  const supabase = createAdminClient();

  // One aggregating round-trip instead of streaming every chunk row to the app
  // and grouping in JS. knowledge_sources() does GROUP BY (source_type,
  // source_id) server-side and returns one row per logical source with its
  // chunk count, token total, latest update, and a representative title +
  // metadata (from the lowest chunk_index). Replaces the old path that loaded
  // up to 50k heavy rows and ran an O(sources × chunks) scan on every load.
  type SourceRow = {
    source_type: string;
    source_id: string;
    title: string | null;
    chunks: number | string; // bigint → may arrive as a string over the wire
    total_tokens: number | string;
    last_updated: string;
    metadata: Record<string, unknown> | null;
  };

  const { data: rows, error } = (await supabase.rpc("knowledge_sources", {
    p_source_type: sourceType ?? null,
  })) as { data: SourceRow[] | null; error: unknown };

  if (error) {
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }

  // Coerce bigint-as-string to numbers, and sort newest-first within each
  // channel so the list keeps a stable order across loads (the RPC join order
  // is otherwise unspecified).
  const rowsArr = (rows ?? [])
    .map((r) => ({ ...r, chunks: Number(r.chunks) || 0, total_tokens: Number(r.total_tokens) || 0 }))
    .sort((a, b) =>
      a.source_type !== b.source_type
        ? a.source_type.localeCompare(b.source_type)
        : (b.last_updated ?? "").localeCompare(a.last_updated ?? ""),
    );

  // Stats per source_type (count = total chunks, sources = distinct source_id).
  const stats: Record<string, { count: number; sources: number; total_tokens: number; last_updated: string | null }> = {};
  for (const r of rowsArr) {
    const s = (stats[r.source_type] ||= { count: 0, sources: 0, total_tokens: 0, last_updated: null });
    s.count += r.chunks;
    s.sources += 1;
    s.total_tokens += r.total_tokens;
    if (!s.last_updated || r.last_updated > s.last_updated) s.last_updated = r.last_updated;
  }

  // Source list — already grouped by the RPC (one row per source, no JS join).
  const sources = rowsArr.map((r) => {
    const meta = r.metadata;
    return {
      source_type: r.source_type,
      source_id: r.source_id,
      title: r.title ?? r.source_id,
      chunks: r.chunks,
      total_tokens: r.total_tokens,
      last_updated: r.last_updated,
      product_line: (meta?.product_line_label as string) ?? (meta?.product_line as string) ?? null,
      space_label: (meta?.space_label as string) ?? null,
      space_url: (meta?.space_url as string) ?? null,
      helpcenter_label: (meta?.helpcenter_label as string) ?? null,
      collection: (meta?.collection as string) ?? null,
      doc_label: (meta?.doc_label as string) ?? null,
      tab_name: (meta?.tab_name as string) ?? null,
      // Web source fields (for per-row re-fetch / display)
      page_url: (meta?.page_url as string) ?? null,
      web_label: (meta?.web_label as string) ?? null,
      // Unified taxonomy fields
      solution: (meta?.solution as string) ?? null,
      product_lines: Array.isArray(meta?.product_lines) ? (meta?.product_lines as string[]) : [],
      models: Array.isArray(meta?.models) ? (meta?.models as string[]) : [],
    };
  });

  const total = rowsArr.reduce((sum, r) => sum + r.chunks, 0);

  return NextResponse.json({ ok: true, stats, sources, total });
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

  if (source_type === "web") {
    const { page_urls, label: webLabel } = body as {
      page_urls?: string[];
      label?: string;
    };

    if (!page_urls?.length) {
      return NextResponse.json(
        { error: "Missing page_urls for web ingestion" },
        { status: 400 }
      );
    }

    try {
      const result = await ingestWeb({
        pageUrls: page_urls,
        label: webLabel,
        force,
        taxonomy,
      });
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      return NextResponse.json(
        { error: `Web ingest failed: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 }
      );
    }
  }

  if (source_type === "text_snippet") {
    const { title, content, label, source_id } = body as {
      title?: string;
      content?: string;
      label?: string;
      source_id?: string;
    };
    if (!title?.trim() || !content?.trim()) {
      return NextResponse.json({ error: "Missing title or content for text snippet" }, { status: 400 });
    }
    const sid = source_id?.trim() || snippetSourceId(title);
    try {
      const result = await ingestTextSnippet({ sourceId: sid, title: title.trim(), content, label, taxonomy });
      return NextResponse.json({ ok: true, source_id: sid, ...result });
    } catch (err) {
      return NextResponse.json(
        { error: `Snippet ingest failed: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 },
      );
    }
  }

  // Note: source_type "file" is ingested via the multipart POST /api/documents/upload.
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

  // For uploaded files, remove the original objects from Storage first.
  if (source_type === "file") {
    let metaQuery = supabase
      .from("documents" as "products")
      .select("metadata")
      .eq("source_type", "file");
    if (source_id) metaQuery = metaQuery.eq("source_id", source_id);
    const { data: rows } = (await metaQuery) as { data: { metadata: Record<string, unknown> | null }[] | null };
    const paths = [
      ...new Set(
        (rows ?? [])
          .map((r) => r.metadata?.storage_path as string | undefined)
          .filter((p): p is string => !!p),
      ),
    ];
    if (paths.length) await supabase.storage.from("knowledge-files").remove(paths);
  }

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
