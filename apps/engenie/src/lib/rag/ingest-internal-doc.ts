/**
 * Internal document packages → RAG.
 *
 * A "package" is a folder of `.md` files exported from a project repo — an SRS
 * with its reference docs, a PRD bundle, design docs. Each package is one
 * `collection`; each file is one source (`<collection>/<path>`), indexed under
 * source_type `internal_doc` and scoped to a kind='knowledge' area, so it is
 * visible to internal `/ask` only and never to the external Search API.
 *
 * Thin wrapper over the shared refined-article core (sibling of
 * ingest-support.ts): file prep lives in internal-doc-prep.ts, chunk → embed →
 * upsert in ingest-refined.ts. Re-ingesting a new version of the package is a
 * clean replace per file (same ids, version in metadata); files that vanished
 * between versions are removed by `pruneVanishedInternalDocs` — run it only
 * after a run that saw the WHOLE package, never after a partial one.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestRefinedArticles, type IngestRefinedResult } from "./ingest-refined";
import { prepareInternalDoc, type PreparedDoc } from "./internal-doc-prep";

/** documents.source_type for internal document packages. */
export const INTERNAL_DOC_SOURCE_TYPE = "internal_doc";

const COLLECTION_RE = /^[a-z0-9][a-z0-9-]{1,60}$/;

export interface InternalDocFile {
  /** Path relative to the package root. */
  relPath: string;
  markdown: string;
  /** Citation link when the package is hosted somewhere stable. */
  sourceUrl?: string | null;
}

export interface IngestInternalDocsOptions {
  /** kind='knowledge' solution slug (e.g. `rd-internal`) → internal-only gating in retrieve.ts. */
  knowledgeArea: string;
  /** Package id, e.g. `craft-ai-srs` — source_id prefix and `metadata.collection`. */
  collection: string;
  /** Chunk prefix shared by the whole package, e.g. `Craft AI SRS v2.0 (Review Draft)`. */
  label: string;
  version?: string;
  /** e.g. `review-draft` / `approved` — the reader's cue for how much to trust the text. */
  status?: string;
  files: InternalDocFile[];
  /** Prep + chunk only; no embed, no write. */
  dryRun?: boolean;
}

export interface IngestInternalDocsResult extends IngestRefinedResult {
  collection: string;
  prepared: PreparedDoc[];
}

/**
 * The area must already exist AND be kind='knowledge'. A typo'd slug would not
 * fail — retrieve.ts treats any slug it doesn't recognise as a product/global
 * solution, i.e. the whole package would become visible to `/api/v1/search`.
 */
export async function assertKnowledgeArea(supabase: SupabaseClient, slug: string): Promise<void> {
  const { data, error } = (await supabase
    .from("solutions")
    .select("slug, kind")
    .eq("slug", slug)
    .maybeSingle()) as { data: { slug: string; kind: string } | null; error: unknown };
  if (error) throw new Error(`knowledge-area lookup failed: ${JSON.stringify(error)}`);
  if (!data) throw new Error(`knowledge area '${slug}' does not exist — create it first (ensureKnowledgeArea).`);
  if (data.kind !== "knowledge") {
    throw new Error(`'${slug}' is a kind='${data.kind}' solution, not a knowledge area — indexing under it would make the package externally visible.`);
  }
}

/** Create the kind='knowledge' area if missing; refuse to reuse a non-knowledge slug. */
export async function ensureKnowledgeArea(
  supabase: SupabaseClient,
  slug: string,
  label: string,
): Promise<"exists" | "created"> {
  const { data, error } = (await supabase
    .from("solutions")
    .select("slug, kind")
    .eq("slug", slug)
    .maybeSingle()) as { data: { slug: string; kind: string } | null; error: unknown };
  if (error) throw new Error(`knowledge-area lookup failed: ${JSON.stringify(error)}`);
  if (data) {
    if (data.kind !== "knowledge") throw new Error(`'${slug}' already exists as a kind='${data.kind}' solution.`);
    return "exists";
  }
  const { error: insErr } = await supabase.from("solutions").insert({
    slug,
    name: label,
    label,
    kind: "knowledge",
    sort_order: 220,
    color_primary: "#475569",
  });
  if (insErr) throw new Error(`create knowledge area failed: ${JSON.stringify(insErr)}`);
  return "created";
}

export async function ingestInternalDocs(opts: IngestInternalDocsOptions): Promise<IngestInternalDocsResult> {
  const { knowledgeArea, collection, label, version, status, files, dryRun = false } = opts;
  if (!COLLECTION_RE.test(collection)) {
    throw new Error(`collection '${collection}' must be a lowercase slug (a-z, 0-9, hyphens).`);
  }
  if (!label.trim()) throw new Error("label is required — it becomes the chunk prefix.");

  const prepared = files.map((f) => prepareInternalDoc(f));
  const articles = prepared.map((p, i) => ({
    markdown: p.markdown,
    sourceId: `${collection}/${p.sourceId}`,
    title: p.title,
    sourceUrl: files[i].sourceUrl ?? null,
    meta: p.meta,
  }));

  const result = await ingestRefinedArticles({
    sourceType: INTERNAL_DOC_SOURCE_TYPE,
    knowledgeArea,
    label: label.trim(),
    extraMeta: {
      collection,
      version: version ?? null,
      status: status ?? null,
      content_type: "internal-doc",
    },
    articles,
    dryRun,
  });

  return { ...result, collection, prepared };
}

/**
 * Delete this collection's sources that were NOT part of the run just
 * completed. `keep` must be every source id the run SAW (all of them, not only
 * the ones re-embedded) — passing a partial set deletes live documents.
 */
export async function pruneVanishedInternalDocs(
  supabase: SupabaseClient,
  collection: string,
  keep: Set<string>,
): Promise<string[]> {
  const { data, error } = (await supabase
    .from("documents")
    .select("source_id")
    .eq("source_type", INTERNAL_DOC_SOURCE_TYPE)
    .eq("metadata->>collection", collection)) as { data: { source_id: string }[] | null; error: unknown };
  if (error) throw new Error(`prune lookup failed: ${JSON.stringify(error)}`);

  const vanished = [...new Set((data ?? []).map((r) => r.source_id))].filter((id) => !keep.has(id));
  if (vanished.length === 0) return [];

  const { error: delErr } = await supabase
    .from("documents")
    .delete()
    .eq("source_type", INTERNAL_DOC_SOURCE_TYPE)
    .in("source_id", vanished);
  if (delErr) throw new Error(`prune delete failed: ${JSON.stringify(delErr)}`);
  return vanished;
}
