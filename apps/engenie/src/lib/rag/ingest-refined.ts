/**
 * Generic ingest for PRE-REFINED knowledge articles — markdown with YAML-ish
 * frontmatter produced by the offline refinery (`/dev/RAG`, 02_refine_with_ai.py).
 *
 * Shared core for the Intercom `support` pipeline and (future) the Mantis
 * bug-tracker pipeline: identical article shape and chunk→embed→upsert, differing
 * only by `sourceType` + the internal `knowledgeArea` the chunks are scoped to.
 * Thin per-source wrappers (ingest-support.ts, later ingest-mantis.ts) just bind
 * those two values.
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
import { generateEmbeddings, contentHash, estimateTokens } from "./embeddings";
import { chunkText } from "./chunk";

const EMBED_BATCH_SIZE = 20;
const MAX_EMBED_CHARS = 21000;

/** EnGenius model-id families, for auto-extracting `models` from article bodies. */
const MODEL_RE =
  /\b(E[CWS][CWS]?\d{2,4}[A-Z]?|EVS\d{2,4}[A-Z]?|ESG\d{2,4}[A-Z]?|EOC\d{2,4}[A-Z]?|EAP\d{2,4}[A-Z]?|ECP\d{2,4}[A-Z]?|EWS\d{2,4}[A-Z]?|ECS\d{2,4}[A-Z]?|EXT\d{2,4}[A-Z]?)\b/gi;

export interface RefinedArticleInput {
  /** Raw markdown for one article, INCLUDING its `--- … ---` frontmatter. */
  markdown: string;
  /** Optional explicit source_id; otherwise taken from frontmatter `id`/`title`. */
  sourceId?: string;
}

export interface IngestRefinedOptions {
  /** documents.source_type discriminator, e.g. 'support' (Intercom) / 'bugtracker' (Mantis). */
  sourceType: string;
  /** kind='knowledge' solution slug → internal-only gating in retrieve.ts. */
  knowledgeArea: string;
  articles: RefinedArticleInput[];
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

/** Colon-free, stable source_id (GET /api/documents splits source ids on ":"). */
function toSourceId(raw: string): string {
  return (
    raw
      .trim()
      .replace(/[:\s]+/g, "-")
      .replace(/[^A-Za-z0-9._-]/g, "")
      .slice(0, 120) || "article"
  );
}

/** "bug | how-to | configuration" / "how-to, faq" → first concrete value. */
function normalizeCategory(v: FmValue | undefined): string | null {
  const s = asStr(v);
  if (!s) return null;
  const first = s.split(/[|,]/)[0].trim();
  return first || null;
}

export async function ingestRefinedArticles(
  opts: IngestRefinedOptions,
): Promise<IngestRefinedResult> {
  const { sourceType, knowledgeArea, articles, dryRun = false } = opts;
  const skipped: { reason: string; sourceId?: string }[] = [];
  const results: IngestRefinedArticleResult[] = [];

  const supabase = dryRun ? null : createAdminClient();
  let totalChunks = 0;
  let totalProcessed = 0;

  for (const article of articles) {
    const { fm, body } = parseFrontmatter(article.markdown);
    const sourceId = toSourceId(article.sourceId || asStr(fm.id) || asStr(fm.title) || "");
    const title =
      asStr(fm.title) || body.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim() || sourceId;
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

    const chunks = chunkText(content, title, asStr(fm.title) || title);
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
    };

    if (dryRun) {
      results.push({ sourceId, title, quality, models, chunks: chunks.length, processed: 0 });
      continue;
    }

    // Clean replace: drop this article's existing chunks first.
    await supabase!
      .from("documents" as "products")
      .delete()
      .eq("source_type", sourceType)
      .eq("source_id", sourceId);

    let processed = 0;
    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
      const texts = batch.map((c) =>
        c.content.length > MAX_EMBED_CHARS ? c.content.slice(0, MAX_EMBED_CHARS) : c.content,
      );
      const embeddings = await generateEmbeddings(texts);

      for (let j = 0; j < batch.length; j++) {
        const idx = i + j;
        const chunk = batch[j];
        const chunkMeta = idx === 0 ? { ...baseMeta, article_title: title } : baseMeta;
        const { error } = await supabase!.from("documents" as "products").upsert(
          {
            source_type: sourceType,
            source_id: sourceId,
            source_url: null,
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
