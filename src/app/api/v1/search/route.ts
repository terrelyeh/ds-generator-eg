import { NextResponse } from "next/server";
import { verifyApiKey, effectiveScope } from "@/lib/auth/api-key";
import { retrieveDocuments } from "@/lib/rag/retrieve";
import type { TaxonomyMeta } from "@/lib/rag/taxonomy";

// Embedding + vector search; no LLM, so 30s is plenty.
export const maxDuration = 30;

/**
 * POST /api/v1/search — RAG retrieval as a service for other departments' apps.
 *
 * Auth: `Authorization: Bearer sk_live_…` (per-department API key).
 * Server-to-server only — do NOT embed the key in browser/client code.
 *
 * Body:
 *   {
 *     "query": "string (required, ≤2000 chars)",
 *     "top_k": 8,                    // 1–20, default 8
 *     "source_types": ["product_spec","helpcenter"],  // optional, narrows within key scope
 *     "taxonomy": { "solution": "...", "product_lines": [...], "models": [...] } // optional
 *   }
 *
 * Returns: { ok, count, results: [{ content, title, source_type, source_id,
 *            source_url, score, taxonomy }], scope }
 *
 * Scope is enforced server-side from the key (the request may only narrow it).
 */
export async function POST(request: Request) {
  const auth = await verifyApiKey(request);
  if (!auth.ok || !auth.key) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: {
    query?: string;
    top_k?: number;
    source_type?: string;
    source_types?: string[];
    taxonomy?: Partial<TaxonomyMeta>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const query = (body.query || "").trim();
  if (!query) return NextResponse.json({ ok: false, error: "Missing 'query'" }, { status: 400 });
  if (query.length > 2000) {
    return NextResponse.json({ ok: false, error: "'query' too long (max 2000 chars)" }, { status: 400 });
  }

  const topK = Math.min(Math.max(Math.floor(Number(body.top_k) || 8), 1), 20);
  const reqSourceTypes = Array.isArray(body.source_types)
    ? body.source_types
    : body.source_type
      ? [body.source_type]
      : null;

  const eff = effectiveScope(auth.key.scope, { taxonomy: body.taxonomy, source_types: reqSourceTypes });

  let docs;
  try {
    docs = await retrieveDocuments({
      question: query,
      taxonomy: eff.taxonomy,
      sourceTypes: eff.sourceTypes,
      finalLimit: topK,
      strictScope: true,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Search failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }

  const results = docs.map((d) => ({
    content: d.content,
    title: d.title,
    source_type: d.source_type,
    source_id: d.source_id,
    source_url: d.source_url,
    score: typeof d.similarity === "number" ? Number(d.similarity.toFixed(4)) : d.similarity,
    taxonomy: {
      solution: (d.metadata?.solution as string) ?? null,
      product_lines: Array.isArray(d.metadata?.product_lines) ? (d.metadata.product_lines as string[]) : [],
      models: Array.isArray(d.metadata?.models) ? (d.metadata.models as string[]) : [],
    },
  }));

  return NextResponse.json({
    ok: true,
    query,
    count: results.length,
    // Echo the effective scope so the caller can see exactly what was searched.
    scope: { client: auth.key.name, taxonomy: eff.taxonomy, source_types: eff.sourceTypes },
    results,
  });
}
