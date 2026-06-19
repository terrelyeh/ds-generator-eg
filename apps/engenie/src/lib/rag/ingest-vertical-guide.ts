/**
 * Vertical Solution Guide ingestion — indexes an approved EnGenius vertical guide
 * (industry × product scope, e.g. "Surveillance for Retail") into the RAG store.
 *
 * Source of truth = the guide's content master `.md` (authored in the
 * `eg-vertical-guides` repo). We index ONLY the sections the author tagged
 * `rag:✓` in their `<!-- src: … rag:… -->` comment — so the Executive Summary
 * (rag:✗), unverified/conditional sections (rag:⚠), sales/CTA blocks (rag:✗),
 * and the internal §11 governance log (rag:✗) are all left out. That tag is the
 * author's curation of "clean, verified knowledge worth retrieving".
 *
 * Visibility: this is EXTERNAL content, so `metadata.solution` must be a
 * `kind='product'` slug (default `cloud`) — never a `kind='knowledge'` area
 * (those are private/opt-in in `retrieve.ts`). source_type `vertical_guide` is a
 * dedicated, auditable corpus; workspaces with an empty `scope.source_types`
 * see it automatically, explicit-whitelist workspaces must add it.
 *
 * Edits/re-gen are a clean replace: existing chunks for the source_id are
 * deleted first (S6 "re-gen on source change"), so shrinking never orphans.
 */

import { createAdminClient } from "@eg/db/admin";
import { generateEmbeddings, contentHash, estimateTokens } from "./embeddings";
import { chunkText } from "./chunk";

const SOURCE_TYPE = "vertical_guide";
const EMBED_BATCH_SIZE = 20;
const MAX_EMBED_CHARS = 21000;

const MODEL_RE =
  /\b(E[CWS][CWS]?\d{2,4}[A-Z]?|EVS\d{2,4}[A-Z]?|ESG\d{2,4}[A-Z]?|EOC\d{2,4}[A-Z]?|EAP\d{2,4}[A-Z]?|ECP\d{2,4}[A-Z]?)\b/gi;

export interface IngestVerticalGuideOptions {
  /** Stable id (re-used on re-gen for a clean replace), e.g. `retail-surveillance`. */
  sourceId: string;
  /** The content-master markdown (front matter + sections). */
  markdown: string;
  /** Deployed guide URL (citation link). */
  sourceUrl?: string | null;
  /**
   * Product-kind solution slug for external visibility (default `cloud`).
   * MUST NOT be a kind='knowledge' slug (e.g. `vertical-market`) — that would
   * make the guide private. See retrieve.ts `inScope`.
   */
  solution?: string;
  /** Facets — default to the master's front matter when omitted. */
  vertical?: string;
  scope?: string;
  locale?: string;
  status?: string;
  productLines?: string[];
  /** null/omitted → auto-extract model IDs mentioned in the indexed content. */
  models?: string[] | null;
  /** Parse + chunk + build the plan, but DON'T embed or write. */
  dryRun?: boolean;
}

export interface VgChunkPreview {
  index: number;
  title: string;
  chars: number;
}

export interface IngestVerticalGuideResult {
  sourceId: string;
  title: string;
  included: string[];
  skipped: { section: string; rag: string }[];
  metadata: Record<string, unknown>;
  chunkPreviews: VgChunkPreview[];
  chunks: number;
  processed: number;
  dryRun: boolean;
}

interface Section {
  heading: string;
  body: string;
  rag: string;
}

/** Minimal top-level `key: value` front-matter parser (no nested keys). */
function parseFrontMatter(md: string): { fm: Record<string, string>; body: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { fm: {}, body: md };
  const fm: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const mm = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/); // top-level only (indented children skipped)
    if (mm && mm[2].trim()) fm[mm[1]] = mm[2].trim().replace(/^["']|["']$/g, "");
  }
  return { fm, body: md.slice(m[0].length) };
}

/** Split the body into `## ` sections, capturing each section's rag flag. */
function splitSections(body: string): Section[] {
  const parts = body.split(/\n(?=## )/);
  const out: Section[] = [];
  for (const part of parts) {
    const hm = part.match(/^## (.+)/);
    if (!hm) continue; // preamble before the first ## (H1 + author notes)
    const heading = hm[1].trim();
    const cm = part.match(/<!--\s*src:[^>]*?rag:\s*(✓|✗|⚠[^\s·>]*)/);
    const rag = cm ? cm[1] : "";
    const cleanBody = part
      .replace(/^## .+\n?/, "") // drop heading line
      .replace(/<!--[\s\S]*?-->/g, "") // drop HTML comments (src tags)
      .trim();
    out.push({ heading, body: cleanBody, rag });
  }
  return out;
}

export async function ingestVerticalGuide(
  opts: IngestVerticalGuideOptions,
): Promise<IngestVerticalGuideResult> {
  const { sourceId, markdown, sourceUrl = null, dryRun = false } = opts;
  const { fm, body } = parseFrontMatter(markdown);

  const vertical = (opts.vertical ?? fm.vertical ?? "").trim();
  const scope = (opts.scope ?? fm.solution_scope ?? "").trim();
  const locale = (opts.locale ?? fm.locale ?? "en").trim();
  const status = (opts.status ?? fm.status ?? "").trim();
  const solution = opts.solution ?? "cloud";
  const productLines = opts.productLines ?? [];

  const title = body.match(/^# (.+)$/m)?.[1].trim() ?? sourceId;
  const label = [vertical, scope].filter(Boolean).join(" · ") || title;

  const sections = splitSections(body);
  const included = sections.filter((s) => s.rag === "✓");
  const skipped = sections
    .filter((s) => s.rag !== "✓")
    .map((s) => ({ section: s.heading, rag: s.rag || "(none)" }));

  if (included.length === 0) {
    throw new Error(`No rag:✓ sections found in "${sourceId}" — nothing to index.`);
  }

  // Rebuild a clean markdown blob from the rag:✓ sections; chunkText re-splits
  // by heading so each chunk stays tied to its section title.
  const cleanContent = included.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n");
  const chunks = chunkText(cleanContent, title, label);

  const models =
    opts.models ??
    [...new Set((cleanContent.match(MODEL_RE) ?? []).map((m) => m.toUpperCase()))];

  const metadata: Record<string, unknown> = {
    source: "vertical-guide",
    solution, // product-kind slug → external-visible
    vertical,
    scope,
    content_type: "vertical-guide",
    status,
    locale,
    version: fm.version ?? null,
    product_lines: productLines,
    models,
  };

  const chunkPreviews: VgChunkPreview[] = chunks.map((c, i) => ({
    index: i,
    title: c.title,
    chars: c.content.length,
  }));

  if (dryRun) {
    return {
      sourceId,
      title,
      included: included.map((s) => s.heading),
      skipped,
      metadata,
      chunkPreviews,
      chunks: chunks.length,
      processed: 0,
      dryRun: true,
    };
  }

  const supabase = createAdminClient();

  // Clean replace (S6 re-gen): drop this guide's existing chunks first.
  await supabase
    .from("documents" as "products")
    .delete()
    .eq("source_type", SOURCE_TYPE)
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
      const chunkMeta = idx === 0 ? { ...metadata, guide_title: title } : metadata;
      const { error } = await supabase.from("documents" as "products").upsert(
        {
          source_type: SOURCE_TYPE,
          source_id: sourceId,
          source_url: sourceUrl,
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
      if (error) throw new Error(`Vertical-guide upsert failed: ${JSON.stringify(error)}`);
      processed++;
    }
  }

  return {
    sourceId,
    title,
    included: included.map((s) => s.heading),
    skipped,
    metadata,
    chunkPreviews,
    chunks: chunks.length,
    processed,
    dryRun: false,
  };
}
