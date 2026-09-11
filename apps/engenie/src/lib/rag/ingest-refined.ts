/**
 * Generic ingest for PRE-REFINED knowledge articles — markdown with YAML-ish
 * frontmatter produced by the offline refinery (`/dev/RAG`, 02_refine_with_ai.py).
 *
 * Shared core for the Intercom `support` pipeline, the `internal_doc` package
 * pipeline (ingest-internal-doc.ts) and (future) the Mantis bug-tracker
 * pipeline: identical article shape and chunk→embed→upsert, differing only by
 * `sourceType` + the internal `knowledgeArea` the chunks are scoped to (plus,
 * for packages, a shared chunk-prefix `label` and collection-level `extraMeta`).
 * Thin per-source wrappers just bind those values.
 *
 * Visibility: `knowledgeArea` is written to `metadata.solution` and MUST be a
 * `kind='knowledge'` slug. retrieve.ts then treats these chunks as private/opt-in
 * — internal `/ask` (no allow-list) sees them; the external `/api/v1/search`
 * (knowledgeAreasAllowed: []) excludes them. (ingest-vertical-guide.ts is the
 * inverse: external content scoped to a kind='product' slug.)
 *
 * Re-ingest is a clean replace per source_id (existing chunks deleted first), so
 * shrinking an article never leaves orphan chunks.
 */

import { createAdminClient } from "@eg/db/admin";
import { trimStaleChunks } from "./replace-chunks";
import { generateEmbeddings, contentHash, estimateTokens, capForEmbedding } from "./embeddings";
import { chunkText } from "./chunk";

const EMBED_BATCH_SIZE = 20;

/** EnGenius model-id families, for auto-extracting `models` from article bodies. */
const MODEL_RE =
  /\b(E[CWS][CWS]?\d{2,4}[A-Z]?|EVS\d{2,4}[A-Z]?|ESG\d{2,4}[A-Z]?|EOC\d{2,4}[A-Z]?|EAP\d{2,4}[A-Z]?|ECP\d{2,4}[A-Z]?|EWS\d{2,4}[A-Z]?|ECS\d{2,4}[A-Z]?|EXT\d{2,4}[A-Z]?)\b/gi;

export interface RefinedArticleInput {
  /** Raw markdown for one article, INCLUDING its `--- … ---` frontmatter. */
  markdown: string;
  /**
   * Optional explicit source_id; otherwise taken from frontmatter `id`/`title`.
   * Explicit ids may contain `/` (path-shaped ids, like google_doc's `docId/…`);
   * derived ids are flattened to a plain slug.
   */
  sourceId?: string;
  /** Display title override (else frontmatter `title`, else the first heading). */
  title?: string;
  /** Citation link, when the document has a stable URL. */
  sourceUrl?: string | null;
  /** Per-article metadata merged over the shared fields (e.g. `path`). */
  meta?: Record<string, unknown>;
  /**
   * Images that belong to this article. A chunk whose text contains `marker`
   * gets `url` in its `metadata.image_urls` — which is what answers and
   * citation tooltips show.
   */
  images?: { marker: string; url: string }[];
  /**
   * Stored as chunk 0's `metadata.raw` (the viewer's copy) when it should
   * differ from the chunked text — e.g. with images put back where their
   * markers are. Defaults to the chunked text.
   */
  raw?: string;
}

export interface IngestRefinedOptions {
  /** documents.source_type discriminator, e.g. 'support' (Intercom) / 'bugtracker' (Mantis). */
  sourceType: string;
  /** kind='knowledge' solution slug → internal-only gating in retrieve.ts. */
  knowledgeArea: string;
  articles: RefinedArticleInput[];
  /**
   * Chunk-prefix label shared by every article (`[label > title]`), e.g. the
   * package name + version + status. Defaults to each article's own title.
   */
  label?: string;
  /** Metadata written on every chunk of every article (e.g. collection/version/status). */
  extraMeta?: Record<string, unknown>;
  /** Parse + chunk only; do not embed or write. */
  dryRun?: boolean;
}

export interface IngestRefinedArticleResult {
  sourceId: string;
  title: string;
  quality: number | null;
  models: string[];
  chunks: number;
  processed: number;
  /** Dry-run only: what each chunk would be titled and how big it is. */
  previews?: { title: string; chars: number; images: number }[];
}

export interface IngestRefinedResult {
  sourceType: string;
  knowledgeArea: string;
  articles: IngestRefinedArticleResult[];
  skipped: { reason: string; sourceId?: string }[];
  totalChunks: number;
  totalProcessed: number;
  dryRun: boolean;
}

type FmValue = string | string[];

/**
 * Minimal frontmatter parser (no yaml dep). Handles top-level `key: scalar` and
 * inline arrays `key: [a, "b", c]` — enough for the refinery's frontmatter
 * (title, source, brand, category, access, quality, models, product_lines,
 * source_conversations, source_tickets). Indented/nested keys are ignored.
 */
function parseFrontmatter(md: string): { fm: Record<string, FmValue>; body: string } {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return { fm: {}, body: md };
  const fm: Record<string, FmValue> = {};
  for (const line of m[1].split("\n")) {
    const mm = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!mm) continue;
    const key = mm[1];
    const raw = mm[2].trim();
    if (!raw) continue;
    if (raw.startsWith("[") && raw.endsWith("]")) {
      fm[key] = raw
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      fm[key] = raw.replace(/^["']|["']$/g, "");
    }
  }
  return { fm, body: md.slice(m[0].length) };
}

const asStr = (v: FmValue | undefined): string | null => (typeof v === "string" ? v : null);
const asArr = (v: FmValue | undefined): string[] =>
  Array.isArray(v) ? v : typeof v === "string" && v ? [v] : [];

/**
 * Colon-free, stable source_id (GET /api/documents splits source ids on ":").
 * `keepSlash` is for caller-supplied path-shaped ids; derived ids never get one.
 */
function toSourceId(raw: string, keepSlash = false): string {
  return (
    raw
      .trim()
      .replace(/[:\s]+/g, "-")
      .replace(keepSlash ? /[^A-Za-z0-9._/-]/g : /[^A-Za-z0-9._-]/g, "")
      .slice(0, 160) || "article"
  );
}

/** "bug | how-to | configuration" / "how-to, faq" → first concrete value. */
function normalizeCategory(v: FmValue | undefined): string | null {
  const s = asStr(v);
  if (!s) return null;
  const first = s.split(/[|,]/)[0].trim();
  return first || null;
}

/** URLs of the images whose marker text appears in this chunk (deduped, in declared order). */
export function imageUrlsForChunk(
  chunkContent: string,
  images: { marker: string; url: string }[] | undefined,
): string[] {
  if (!images?.length) return [];
  return [...new Set(images.filter((i) => i.marker && chunkContent.includes(i.marker)).map((i) => i.url))];
}

export async function ingestRefinedArticles(
  opts: IngestRefinedOptions,
): Promise<IngestRefinedResult> {
  const { sourceType, knowledgeArea, articles, label, extraMeta, dryRun = false } = opts;
  const skipped: { reason: string; sourceId?: string }[] = [];
  const results: IngestRefinedArticleResult[] = [];

  const supabase = dryRun ? null : createAdminClient();
  let totalChunks = 0;
  let totalProcessed = 0;

  for (const article of articles) {
    const { fm, body } = parseFrontmatter(article.markdown);
    const sourceId = article.sourceId
      ? toSourceId(article.sourceId, true)
      : toSourceId(asStr(fm.id) || asStr(fm.title) || "");
    const title =
      article.title?.trim() ||
      asStr(fm.title) ||
      body.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim() ||
      sourceId;
    const content = body.trim();

    if (!content) {
      skipped.push({ reason: "empty body", sourceId });
      continue;
    }

    const productLines = asArr(fm.product_lines);
    const fmModels = asArr(fm.models).map((m) => m.toUpperCase());
    const autoModels = [
      ...new Set((content.match(MODEL_RE) ?? []).map((m) => m.toUpperCase())),
    ];
    const models = [...new Set([...fmModels, ...autoModels])];

    const qStr = asStr(fm.quality);
    const qNum = qStr != null && qStr !== "" ? Number(qStr) : NaN;
    const quality = Number.isFinite(qNum) ? qNum : null;

    const chunks = chunkText(content, title, label || asStr(fm.title) || title);
    totalChunks += chunks.length;

    const baseMeta: Record<string, unknown> = {
      source: asStr(fm.source) ?? sourceType,
      // knowledge-area slug → private/opt-in gating in retrieve.ts (internal-only)
      solution: knowledgeArea,
      product_lines: productLines,
      models,
      brand: asStr(fm.brand),
      category: normalizeCategory(fm.category),
      access: "internal",
      quality,
      source_conversations: asArr(fm.source_conversations),
      source_tickets: asArr(fm.source_tickets),
      ...extraMeta,
      ...article.meta,
    };

    if (dryRun) {
      results.push({
        sourceId,
        title,
        quality,
        models,
        chunks: chunks.length,
        processed: 0,
        previews: chunks.map((c) => ({
          title: c.title,
          chars: c.content.length,
          images: imageUrlsForChunk(c.content, article.images).length,
        })),
      });
      continue;
    }

    // Clean replace: drop this article's existing chunks first.
    let processed = 0;
    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
      const texts = batch.map((c) =>
        capForEmbedding(c.content),
      );
      const embeddings = await generateEmbeddings(texts);

      for (let j = 0; j < batch.length; j++) {
        const idx = i + j;
        const chunk = batch[j];
        // chunk 0 carries the exact original for the in-app viewer that
        // citations link to; the fallback (reassembling from chunks) is a
        // reading copy with seams, not the document as written.
        const imageUrls = imageUrlsForChunk(chunk.content, article.images);
        const withImages = imageUrls.length > 0 ? { ...baseMeta, image_urls: imageUrls } : baseMeta;
        const chunkMeta =
          idx === 0 ? { ...withImages, article_title: title, raw: article.raw ?? content } : withImages;
        const { error } = await supabase!.from("documents" as "products").upsert(
          {
            source_type: sourceType,
            source_id: sourceId,
            source_url: article.sourceUrl ?? null,
            title: chunk.title,
            chunk_index: idx,
            content: chunk.content,
            token_count: estimateTokens(chunk.content),
            metadata: chunkMeta,
            embedding: `[${embeddings[j].join(",")}]`,
            content_hash: contentHash(chunk.content),
            updated_at: new Date().toISOString(),
          } as Record<string, unknown>,
          { onConflict: "source_type,source_id,chunk_index" },
        );
        if (error) {
          throw new Error(`Refined-article upsert failed (${sourceId}:${idx}): ${JSON.stringify(error)}`);
        }
        processed++;
      }
    }

    await trimStaleChunks(supabase!, sourceType, sourceId, chunks.length);

    totalProcessed += processed;
    results.push({ sourceId, title, quality, models, chunks: chunks.length, processed });
  }

  return {
    sourceType,
    knowledgeArea,
    articles: results,
    skipped,
    totalChunks,
    totalProcessed,
    dryRun,
  };
}
