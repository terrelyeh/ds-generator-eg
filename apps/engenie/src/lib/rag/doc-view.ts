/**
 * Loading an indexed source back as a readable document, for the in-app
 * viewer that citations link to.
 *
 * Why this exists: a citation is only useful if the reader can open what it
 * cites. External sources (gitbook, help centre, google docs, vertical guides)
 * carry an http `source_url` and link out. Everything stored HERE — uploaded
 * files, support articles, snippets, internal doc packages — had no URL at
 * all, so those citations were dead text. `wifi_regulation` already solved
 * this by pointing `source_url` at an in-app page; this generalises that.
 *
 * Two ways to get the text back:
 *   1. `metadata.raw` on chunk 0 — the exact original, written at ingest.
 *   2. Reassembled from the chunks themselves — for everything indexed before
 *      (1) existed. Lossy at the seams, so the page says so.
 */

import { createAdminClient } from "@eg/db/admin";

/** Source types the viewer can render. `file` is handled separately (signed URL). */
export const VIEWABLE_SOURCE_TYPES = ["internal_doc", "support", "text_snippet"] as const;

/** Types whose citations should point at the in-app viewer. */
export const VIEWER_LINKED_SOURCE_TYPES = [...VIEWABLE_SOURCE_TYPES, "file"] as const;

export interface DocChunk {
  chunk_index: number;
  title: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
}

export interface LoadedDoc {
  sourceType: string;
  sourceId: string;
  title: string;
  markdown: string;
  /** true when rebuilt from chunks rather than read from metadata.raw. */
  reconstructed: boolean;
  metadata: Record<string, unknown>;
}

/** The `[label > title]` header `chunk.ts` puts at the top of every chunk. */
const CHUNK_PREFIX_RE = /^\[[^\]\n]*\]\n\n/;

export function stripChunkPrefix(content: string): string {
  return content.replace(CHUNK_PREFIX_RE, "");
}

/**
 * Rebuild a readable document from its chunks.
 *
 * Chunks overlap at the edges by design (a short section is merged into the
 * next one), and each carries the same prefix, so this is a reading copy —
 * not a byte-exact original. Parts of one split section are re-joined without
 * repeating the heading.
 */
export function reconstructFromChunks(chunks: DocChunk[]): string {
  const ordered = [...chunks].sort((a, b) => a.chunk_index - b.chunk_index);
  const seen = new Set<string>();
  const parts: string[] = [];

  for (const c of ordered) {
    const body = stripChunkPrefix(c.content).trim();
    if (!body) continue;
    // Identical bodies can repeat when a source was re-indexed oddly; keep one.
    if (seen.has(body)) continue;
    seen.add(body);
    parts.push(body);
  }
  return parts.join("\n\n");
}

/** Title for the viewer: the ingest-time display title, else the first chunk's. */
export function docTitle(chunks: DocChunk[], sourceId: string): string {
  const first = [...chunks].sort((a, b) => a.chunk_index - b.chunk_index)[0];
  const meta = (first?.metadata ?? {}) as Record<string, unknown>;
  const candidates = [meta.article_title, meta.snippet_title, meta.guide_title, meta.file_name];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return first?.title?.trim() || sourceId;
}

/** Load one indexed source for the viewer. Returns null when it doesn't exist. */
export async function loadDoc(sourceType: string, sourceId: string): Promise<LoadedDoc | null> {
  const supabase = createAdminClient();
  const { data, error } = (await supabase
    .from("documents" as "products")
    .select("chunk_index, title, content, metadata")
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .order("chunk_index")) as { data: DocChunk[] | null; error: unknown };

  if (error) throw new Error(`doc lookup failed: ${JSON.stringify(error)}`);
  const chunks = data ?? [];
  if (chunks.length === 0) return null;

  const first = chunks[0];
  const metadata = (first.metadata ?? {}) as Record<string, unknown>;
  const raw = typeof metadata.raw === "string" && metadata.raw.trim() ? metadata.raw : null;

  return {
    sourceType,
    sourceId,
    title: docTitle(chunks, sourceId),
    markdown: raw ?? reconstructFromChunks(chunks),
    reconstructed: raw === null,
    metadata,
  };
}

/**
 * Relative URL of the in-app viewer for one source. Stored as `source_url` so
 * the citation becomes a link — relative, not absolute, so it works on every
 * deployment and inherits the app's own login gate.
 */
export function viewerPath(sourceType: string, sourceId: string): string {
  const segments = sourceId.split("/").filter(Boolean).map(encodeURIComponent);
  return `/knowledge/doc/${encodeURIComponent(sourceType)}/${segments.join("/")}`;
}

/** Private bucket for images that belong to indexed knowledge (migration 00058). */
export const KNOWLEDGE_ASSETS_BUCKET = "knowledge-assets";

/**
 * Storage paths the asset route will sign: an image under a source-type
 * prefix, no empty/dot segments. Anything else in the bucket — or any other
 * bucket — is unreachable through the route.
 */
const ASSET_PATH_RE = /^internal_doc\/[a-z0-9][a-z0-9-]*\/[A-Za-z0-9._/-]+\.(svg|png|jpe?g|webp)$/i;

export function isAllowedAssetPath(storagePath: string): boolean {
  if (!ASSET_PATH_RE.test(storagePath)) return false;
  return !storagePath.split("/").some((seg) => seg === "" || seg === "." || seg === "..");
}

/** Where a package image is stored: `<source_type>/<collection>/<package-relative path>`. */
export function assetStoragePath(sourceType: string, collection: string, relPath: string): string {
  return `${sourceType}/${collection}/${relPath}`;
}

/** Relative URL answers and the viewer use for a stored image (served by /api/knowledge-assets). */
export function assetUrl(storagePath: string): string {
  return `/api/knowledge-assets/${storagePath.split("/").filter(Boolean).map(encodeURIComponent).join("/")}`;
}

/** decodeURIComponent that returns its input on a malformed escape instead of throwing. */
export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
