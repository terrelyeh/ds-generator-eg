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
import { assetStoragePath, assetUrl, isAllowedAssetPath, KNOWLEDGE_ASSETS_BUCKET, viewerPath } from "./doc-view";

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
  /**
   * Package-relative paths of the images that exist in the assets bucket
   * (uploaded this run, or found on disk for a dry run). An image outside this
   * set keeps its text marker and gets no URL — a figure that would 404 is
   * worse than none.
   */
  assets?: Set<string>;
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

/** Resolve a prepared doc's images to URLs, and build the viewer's copy with them put back. */
function withImages(p: PreparedDoc, collection: string, assets: Set<string> | undefined) {
  const images = p.images.flatMap((img) => {
    const url =
      img.url ??
      (img.path && assets?.has(img.path)
        ? assetUrl(assetStoragePath(INTERNAL_DOC_SOURCE_TYPE, collection, img.path))
        : null);
    return url ? [{ marker: img.marker, url, alt: img.alt }] : [];
  });
  if (images.length === 0) return {};
  // The chunked text keeps the marker — it's what makes a diagram findable —
  // and the viewer's copy gets the image itself back in the same place.
  const raw = images.reduce(
    (md, img) => md.split(img.marker).join(`![${img.alt.replace(/[[\]]/g, "")}](${img.url})`),
    p.markdown,
  );
  return { images: images.map(({ marker, url }) => ({ marker, url })), raw };
}

export async function ingestInternalDocs(opts: IngestInternalDocsOptions): Promise<IngestInternalDocsResult> {
  const { knowledgeArea, collection, label, version, status, files, assets, dryRun = false } = opts;
  if (!COLLECTION_RE.test(collection)) {
    throw new Error(`collection '${collection}' must be a lowercase slug (a-z, 0-9, hyphens).`);
  }
  if (!label.trim()) throw new Error("label is required — it becomes the chunk prefix.");

  const prepared = files.map((f) => prepareInternalDoc(f));
  const articles = prepared.map((p, i) => {
    const sourceId = `${collection}/${p.sourceId}`;
    return {
      markdown: p.markdown,
      sourceId,
      title: p.title,
      // No external URL for an internal package, so point the citation at the
      // in-app viewer. That link opens the version that was actually indexed —
      // a repo link would drift the moment the document is edited again.
      sourceUrl: files[i].sourceUrl ?? viewerPath(INTERNAL_DOC_SOURCE_TYPE, sourceId),
      meta: p.meta,
      ...withImages(p, collection, assets),
    };
  });

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

const ASSET_CONTENT_TYPES: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** Content type for a package image, or null when it isn't one the assets bucket accepts. */
export function assetContentType(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return ASSET_CONTENT_TYPES[ext] ?? null;
}

/**
 * Upload a package's images to the private assets bucket (upsert, so a new
 * version of a diagram replaces the old one at the same path). Returns the
 * package-relative paths now available — pass them to ingestInternalDocs as
 * `assets`. Refuses any path the asset route wouldn't serve, so nothing gets
 * stored that no reader could ever reach.
 */
export async function uploadInternalDocAssets(
  supabase: SupabaseClient,
  collection: string,
  files: { path: string; bytes: Uint8Array }[],
): Promise<Set<string>> {
  const done = new Set<string>();
  for (const f of files) {
    const contentType = assetContentType(f.path);
    const storagePath = assetStoragePath(INTERNAL_DOC_SOURCE_TYPE, collection, f.path);
    if (!contentType || !isAllowedAssetPath(storagePath)) {
      throw new Error(`refusing to upload '${f.path}' — not an image path the asset route will serve`);
    }
    const { error } = await supabase.storage
      .from(KNOWLEDGE_ASSETS_BUCKET)
      .upload(storagePath, f.bytes, { contentType, upsert: true });
    if (error) throw new Error(`asset upload failed (${f.path}): ${error.message}`);
    done.add(f.path);
  }
  return done;
}
