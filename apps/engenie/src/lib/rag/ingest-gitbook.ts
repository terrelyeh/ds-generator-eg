/**
 * Gitbook Ingestion Pipeline
 *
 * Flow: sitemap → pages that changed → in batches of five:
 *       fetch → image descriptions → chunk → hash → embed → upsert → trim
 *
 * Chunks are split by headings (H1/H2/H3). Each chunk includes:
 * - Breadcrumb path for context (e.g., "Cloud Licensing > Device Pro License > FAQ")
 * - Image descriptions inline as [Image: ...]
 * - Source URL for citation
 *
 * Batches, not phases. This used to fetch every changed page, then describe
 * every image, then embed and write, so nothing reached the database until
 * the whole space was done. A space too big for one function run — the
 * weekly cron, or a UI sync past 300s — was killed with nothing saved, and
 * the next run started from the same place and died the same way. Now each
 * batch is written before the next is fetched: an interrupted run keeps what
 * it finished, and `deadline` lets a caller stop between batches on purpose.
 *
 * What decides which pages are fetched, and when Vision can be skipped, is in
 * `gitbook-plan.ts` with tests.
 */

import { createAdminClient } from "@eg/db/admin";
import { logIfDbError } from "@eg/db/errors";
import { generateEmbeddings, contentHash, estimateTokens, capForEmbedding } from "./embeddings";
import {
  fetchGitbookSitemap,
  fetchGitbookPage,
  urlToBreadcrumb,
  hasSubstantialContent,
} from "./gitbook-fetcher";
import { describeImages } from "./vision";
import { selectAll } from "./select-all";
import {
  FOCUSED_CHUNK_INDEX,
  gitbookSourceId,
  indexExistingPages,
  missingMarkers,
  pageFingerprint,
  planPageWrites,
  selectPagesToFetch,
  staleChunkIndices,
  visionState,
  type ExistingGitbookRow,
  type IndexedPage,
  type SitemapEntry,
} from "./gitbook-plan";
import { normalizeTaxonomy, type TaxonomyMeta } from "./taxonomy";

/** Max characters per chunk (~1500 tokens) */
const MAX_CHUNK_CHARS = 5000;
/** Min characters to be considered a valid chunk */
const MIN_CHUNK_CHARS = 50;
/** Embedding batch size */
const EMBED_BATCH_SIZE = 20;
/** Pages fetched — and then written — together. */
const FETCH_CONCURRENCY = 5;
/** Images described at once. */
const VISION_CONCURRENCY = 3;

export interface IngestGitbookOptions {
  /** Root URL of the Gitbook space */
  spaceUrl: string;
  /** Human-readable label for this space (e.g., "Cloud Licensing") */
  spaceLabel: string;
  /** Force re-embed even if content unchanged */
  force?: boolean;
  /** Enable image description via Vision API */
  enableVision?: boolean;
  /** Taxonomy metadata — solution/product_lines/models */
  taxonomy?: Partial<TaxonomyMeta>;
  /**
   * Epoch ms. No batch of pages starts after it, and Vision stops describing.
   * A page not reached is left exactly as stored — nothing records its new
   * date — so the next run picks it up. Counted in `pages_deferred`.
   */
  deadline?: number;
}

export interface IngestGitbookResult {
  processed: number;
  skipped: number;
  pages_fetched: number;
  pages_skipped: number;
  /** Changed pages left for the next run because `deadline` passed. */
  pages_deferred: number;
  images_described: number;
  errors: string[];
}

interface ChunkToEmbed {
  sourceId: string;
  sourceUrl: string;
  chunkIndex: number;
  content: string;
  title: string;
  hash: string;
  metadata: Record<string, unknown>;
}

interface FetchedPage {
  url: string;
  sourceId: string;
  lastModified?: string;
  fingerprint: string;
  content: string;
  imageUrls: string[];
  sectionImages: Map<string, string[]>;
  title: string;
}

/** The date and fingerprint that say "this page is indexed as of now". */
interface PageMarkers {
  lastModified?: string;
  pageHash?: string;
}

interface PlannedPage {
  sourceId: string;
  /** Chunks whose content changed, in write order. */
  changed: ChunkToEmbed[];
  /** Every chunk index the page produces now, changed or not. */
  produced: Set<number>;
  markers: PageMarkers;
}

interface RunContext {
  supabase: ReturnType<typeof createAdminClient>;
  baseUrl: string;
  spaceLabel: string;
  force: boolean;
  enableVision: boolean;
  tax: TaxonomyMeta;
  deadline?: number;
  existing: Map<string, IndexedPage>;
  result: IngestGitbookResult;
}

/**
 * Split page content into chunks by headings.
 * Each chunk gets the page breadcrumb prepended for context.
 * Also maps images to the chunk whose heading section they belong to.
 */
function chunkByHeadings(
  content: string,
  breadcrumb: string[],
  pageTitle: string,
  sectionImages?: Map<string, string[]>
): { title: string; content: string; images: string[] }[] {
  const breadcrumbPrefix = breadcrumb.length > 0
    ? `[${breadcrumb.join(" > ")}]\n\n`
    : "";

  // Split on H1/H2/H3 markers (from our htmlToText converter)
  const sections = content.split(/\n(?=#{1,3} )/);

  const chunks: { title: string; content: string; images: string[] }[] = [];

  // Helper: find images for a section title by fuzzy matching against sectionImages keys
  function findSectionImages(title: string): string[] {
    if (!sectionImages || sectionImages.size === 0) return [];
    // Exact match
    if (sectionImages.has(title)) return sectionImages.get(title) || [];
    // Case-insensitive match
    const lower = title.toLowerCase();
    for (const [key, urls] of sectionImages) {
      if (key.toLowerCase() === lower) return urls;
    }
    return [];
  }

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed || trimmed.length < MIN_CHUNK_CHARS) continue;

    // Extract heading for chunk title
    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)/);
    const sectionTitle = headingMatch
      ? headingMatch[1].trim()
      : pageTitle;

    const images = findSectionImages(sectionTitle);
    const fullContent = breadcrumbPrefix + trimmed;

    // If section is too long, split further by paragraphs
    if (fullContent.length > MAX_CHUNK_CHARS) {
      const subChunks = splitLongSection(fullContent, sectionTitle, breadcrumbPrefix);
      // Attach images only to the first sub-chunk
      chunks.push(...subChunks.map((c, i) => ({ ...c, images: i === 0 ? images : [] })));
    } else {
      chunks.push({ title: sectionTitle, content: fullContent, images });
    }
  }

  // If no heading-based chunks were created, treat entire content as one chunk
  if (chunks.length === 0 && content.trim().length >= MIN_CHUNK_CHARS) {
    // Collect all intro images
    const introImages = findSectionImages("_intro");
    chunks.push({
      title: pageTitle,
      content: breadcrumbPrefix + content.trim(),
      images: introImages,
    });
  }

  return chunks;
}

/**
 * Split a long section into sub-chunks by paragraph boundaries.
 */
function splitLongSection(
  content: string,
  title: string,
  breadcrumbPrefix: string
): { title: string; content: string; images: string[] }[] {
  const paragraphs = content.split(/\n\n+/);
  const chunks: { title: string; content: string; images: string[] }[] = [];
  let current = breadcrumbPrefix;
  let partIndex = 1;

  for (const para of paragraphs) {
    if (current.length + para.length > MAX_CHUNK_CHARS && current.length > breadcrumbPrefix.length) {
      chunks.push({
        title: `${title} (Part ${partIndex})`,
        content: current.trim(),
        images: [],
      });
      current = breadcrumbPrefix;
      partIndex++;
    }
    current += para + "\n\n";
  }

  if (current.trim().length > breadcrumbPrefix.length) {
    chunks.push({
      title: partIndex > 1 ? `${title} (Part ${partIndex})` : title,
      content: current.trim(),
      images: [],
    });
  }

  return chunks;
}

/**
 * Inject image descriptions into page content.
 * Replaces image reference positions or appends at end.
 */
function injectImageDescriptions(
  content: string,
  imageUrls: string[],
  descriptions: Map<string, string | null>
): string {
  let enriched = content;

  // Append image descriptions at the end of content
  const imageDescriptions: string[] = [];
  for (const url of imageUrls) {
    const desc = descriptions.get(url);
    if (desc) {
      imageDescriptions.push(`[Image: ${desc}]`);
    }
  }

  if (imageDescriptions.length > 0) {
    enriched += "\n\n" + imageDescriptions.join("\n\n");
  }

  return enriched;
}

/**
 * A dedicated "focused" chunk for a page's LED behaviour table, if Vision
 * extracted one.
 *
 * Large Vision-extracted tables (especially LED behavior tables on QSG pages)
 * live inside big page chunks alongside many unrelated image descriptions.
 * That dilutes the embedding signal so even the correct chunk loses to more
 * generic LED-ish chunks from other pages. For any image whose description
 * contains a table pattern (markdown table with LED/Status/Color/Behavior
 * keywords), we emit an extra dedicated chunk that holds ONLY the table plus
 * a clean title derived from the page breadcrumb. This ranks reliably on
 * queries like "ECW536 LED Behavior".
 *
 * One per page, first match wins, always at FOCUSED_CHUNK_INDEX.
 */
function focusedLedTable(
  page: FetchedPage,
  breadcrumb: string[],
  descriptions: Map<string, string | null>,
): { content: string; title: string; imageUrl: string } | null {
  // Derive a model hint from the last breadcrumb segment (e.g. "ecw536" -> "ECW536")
  const modelHint = breadcrumb[breadcrumb.length - 1]?.toUpperCase() || page.title;

  for (const imageUrl of page.imageUrls) {
    const desc = descriptions.get(imageUrl);
    if (!desc) continue;

    // Detect table content — markdown pipe table with LED/Status/Color/Behavior keywords
    const looksLikeTable = /\|.*\|.*\|/.test(desc) && /\|\s*:?-+/.test(desc);
    const looksLikeLedTable =
      looksLikeTable &&
      (/LED\s*(Color|Behavior|Status)/i.test(desc) ||
        /\bPWR\b.*\b(Orange|Blue|Green|Red|White|Amber)\b/i.test(desc) ||
        /\bFlashing\b[\s\S]*\bSolid\b/i.test(desc));

    if (!looksLikeLedTable) continue;

    // Extract just the table portion (from first `|` line to end of contiguous `|` lines)
    const lines = desc.split("\n");
    const startIdx = lines.findIndex((l) => l.trim().startsWith("|"));
    if (startIdx < 0) continue;
    let endIdx = startIdx;
    while (endIdx < lines.length && (lines[endIdx].trim().startsWith("|") || lines[endIdx].trim() === "")) {
      endIdx++;
    }
    const tableMd = lines.slice(startIdx, endIdx).join("\n").trim();
    if (tableMd.length < 60) continue;

    // Bilingual header so both English ("LED behavior") and Chinese
    // ("LED 燈號 / 指示燈 / 狀態") queries match the embedding.
    return {
      content: `${breadcrumb.join(" > ")}\n\n## ${modelHint} — LED Behavior Table / LED 燈號行為表 / 指示燈狀態說明\n\nModel / 型號: ${modelHint}\nKeywords: LED status indicator light color behavior meaning, LED 指示燈 狀態 顏色 含義 閃爍 恆亮\n\n${tableMd}`,
      title: `${modelHint} — LED Behavior`,
      imageUrl,
    };
  }
  return null;
}

/**
 * Every chunk already stored under this space's path — paged, because the
 * old unpaged read of all gitbook rows stopped at 1000 (see select-all).
 *
 * Scoped by source_id prefix rather than `metadata->>space_url`: a source_id
 * is the page's URL path, so the prefix reaches every row a page of this
 * space can own, whatever its metadata says. It also picks up a nested
 * space's rows (…/manual/jp under …/manual); no page of this space maps to
 * those ids, so they only cost the read.
 */
async function loadExistingChunks(
  supabase: ReturnType<typeof createAdminClient>,
  baseUrl: string,
): Promise<ExistingGitbookRow[]> {
  let prefix = "";
  try {
    prefix = new URL(baseUrl).pathname.replace(/^\/+|\/+$/g, "");
  } catch {
    // An unparsable space URL fetched no sitemap either; read the whole type.
  }
  return selectAll<ExistingGitbookRow>((from, to) => {
    let query = supabase
      .from("documents" as "products")
      .select(
        "source_id, chunk_index, content_hash, last_modified:metadata->>last_modified, page_hash:metadata->>page_hash",
      )
      .eq("source_type", "gitbook");
    if (prefix) query = query.like("source_id", `${prefix}%`);
    return query.order("id").range(from, to) as unknown as PromiseLike<{
      data: ExistingGitbookRow[] | null;
      error: unknown;
    }>;
  }, "gitbook existing chunks");
}

/**
 * Main ingestion function for Gitbook spaces.
 */
export async function ingestGitbook(
  options: IngestGitbookOptions
): Promise<IngestGitbookResult> {
  const { spaceUrl, spaceLabel, force = false, enableVision = true, taxonomy, deadline } = options;
  const result: IngestGitbookResult = {
    processed: 0,
    skipped: 0,
    pages_fetched: 0,
    pages_skipped: 0,
    pages_deferred: 0,
    images_described: 0,
    errors: [],
  };

  // Step 1: Fetch sitemap
  let sitemapEntries: SitemapEntry[];
  try {
    sitemapEntries = await fetchGitbookSitemap(spaceUrl);
  } catch (err) {
    result.errors.push(`Sitemap fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  const baseUrl = spaceUrl.replace(/\/$/, "");
  const supabase = createAdminClient();

  // Step 2: What is stored for this space. A failed read stops here: carrying
  // on would treat every page as new and describe and embed the whole space.
  let existing: Map<string, IndexedPage>;
  try {
    existing = indexExistingPages(await loadExistingChunks(supabase, baseUrl));
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
    return result;
  }

  // Step 3: Only pages whose sitemap date is not stored yet (all under force).
  const plan = selectPagesToFetch(sitemapEntries, existing, force);
  result.pages_skipped += plan.unchanged;

  const ctx: RunContext = {
    supabase,
    baseUrl,
    spaceLabel,
    force,
    enableVision,
    tax: normalizeTaxonomy(taxonomy),
    deadline,
    existing,
    result,
  };

  // Step 4: One batch at a time, written before the next one starts.
  for (let i = 0; i < plan.toFetch.length; i += FETCH_CONCURRENCY) {
    if (deadline !== undefined && Date.now() >= deadline) {
      result.pages_deferred += plan.toFetch.length - i;
      break;
    }
    await ingestBatch(plan.toFetch.slice(i, i + FETCH_CONCURRENCY), ctx);
  }

  return result;
}

async function ingestBatch(entries: SitemapEntry[], ctx: RunContext): Promise<void> {
  const { result, existing, force, enableVision } = ctx;

  // Fetch
  const settled = await Promise.allSettled(
    entries.map(async (entry) => ({ entry, page: await fetchGitbookPage(entry.url) })),
  );
  const pages: FetchedPage[] = [];
  for (const outcome of settled) {
    if (outcome.status === "rejected") {
      result.errors.push(`Fetch failed: ${outcome.reason}`);
      continue;
    }
    result.pages_fetched++;
    const { entry, page } = outcome.value;

    // Skip empty/nav pages — they produce no chunks, so nothing to describe.
    if (!hasSubstantialContent(page.content)) {
      result.pages_skipped++;
      continue;
    }

    const sourceId = gitbookSourceId(entry.url);
    const fingerprint = pageFingerprint(page);
    if (!force && existing.get(sourceId)?.pageHashes.has(fingerprint)) {
      // Same text, same images as when this page was last described. Keep
      // what is stored; only its new date may need recording, so that the
      // sitemap check skips it next time without a fetch.
      result.pages_skipped++;
      await recordMarkers(ctx, sourceId, { lastModified: entry.lastModified });
      continue;
    }

    pages.push({ ...page, url: entry.url, sourceId, lastModified: entry.lastModified, fingerprint });
  }
  if (pages.length === 0) return;

  // Describe
  let descriptions = new Map<string, string | null>();
  let retry: { url: string; reason: string }[] = [];
  if (enableVision) {
    const imageUrls = [...new Set(pages.flatMap((p) => p.imageUrls))];
    if (imageUrls.length > 0) {
      try {
        ({ descriptions, retry } = await describeImages(imageUrls, VISION_CONCURRENCY, ctx.deadline));
      } catch (err) {
        // Writing these pages now would store them without descriptions.
        result.errors.push(`Vision API error: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      for (const url of imageUrls) if (descriptions.get(url)) result.images_described++;
    }
  }
  const retryUrls = new Set(retry.map((r) => r.url));

  // Chunk
  const planned: PlannedPage[] = [];
  let heldBack = 0;
  for (const page of pages) {
    const state = enableVision ? visionState(page.imageUrls, descriptions, retryUrls) : "complete";
    if (state === "deferred") {
      // Vision stopped at the deadline before reaching this page's images.
      // Written now, it would replace the descriptions it has with none.
      result.pages_deferred++;
      continue;
    }
    if (state === "retry") {
      heldBack++;
      continue;
    }
    // With Vision off, a page with images is stored undescribed, so it gets no
    // fingerprint: a later run with Vision on must not skip it.
    const fingerprinted = enableVision || page.imageUrls.length === 0;
    planned.push(planPage(ctx, page, descriptions, fingerprinted));
  }
  if (heldBack > 0) {
    result.errors.push(
      `Vision failed for ${retry.length} image(s) (${retry[0].reason}); ` +
        `${heldBack} page(s) left unwritten for the next run`,
    );
  }

  // Embed
  const vectors = new Map<ChunkToEmbed, number[]>();
  const toEmbed = planned.flatMap((p) => p.changed);
  for (let i = 0; i < toEmbed.length; i += EMBED_BATCH_SIZE) {
    const group = toEmbed.slice(i, i + EMBED_BATCH_SIZE);
    try {
      const embeddings = await generateEmbeddings(group.map((c) => capForEmbedding(c.content)));
      group.forEach((chunk, j) => {
        if (embeddings[j]) vectors.set(chunk, embeddings[j]);
      });
    } catch (err) {
      result.errors.push(`Embedding batch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Write
  for (const page of planned) {
    await writePage(ctx, page, vectors);
  }
}

/** The page's chunks, which of them changed, and the markers to store. */
function planPage(
  ctx: RunContext,
  page: FetchedPage,
  descriptions: Map<string, string | null>,
  fingerprinted: boolean,
): PlannedPage {
  const { result, existing, force, tax } = ctx;
  const stored = existing.get(page.sourceId)?.hashes;
  const breadcrumb = urlToBreadcrumb(page.url, ctx.baseUrl);
  const enriched = injectImageDescriptions(page.content, page.imageUrls, descriptions);
  const pieces = chunkByHeadings(enriched, breadcrumb, page.title, page.sectionImages);

  const produced = new Set<number>();
  const changed: ChunkToEmbed[] = [];
  const consider = (chunkIndex: number, content: string, title: string, metadata: Record<string, unknown>) => {
    produced.add(chunkIndex);
    const hash = contentHash(content);
    if (!force && stored?.get(chunkIndex) === hash) {
      result.skipped++;
      return;
    }
    changed.push({ sourceId: page.sourceId, sourceUrl: page.url, chunkIndex, content, title, hash, metadata });
  };

  const shared = {
    space_url: ctx.baseUrl,
    space_label: ctx.spaceLabel,
    breadcrumb,
    page_title: page.title,
    solution: tax.solution,
    product_lines: tax.product_lines,
    models: tax.models,
  };

  pieces.forEach((chunk, i) =>
    consider(i, chunk.content, chunk.title, {
      ...shared,
      has_images: chunk.images.length > 0,
      images_count: chunk.images.length,
      image_urls: chunk.images.length > 0 ? chunk.images : undefined,
    }),
  );

  const focused = focusedLedTable(page, breadcrumb, descriptions);
  if (focused) {
    consider(FOCUSED_CHUNK_INDEX, focused.content, focused.title, {
      ...shared,
      chunk_type: "focused_led_table",
      source_image_url: focused.imageUrl,
    });
  }

  return {
    sourceId: page.sourceId,
    changed,
    produced,
    markers: {
      lastModified: page.lastModified,
      pageHash: fingerprinted ? page.fingerprint : undefined,
    },
  };
}

/**
 * Write one page in the order `planPageWrites` gives — changed chunks, the
 * stale-chunk trim (written first, trimmed after, #71), and the markers last
 * — stopping at the first step that fails, so a page is never marked done
 * half-written.
 */
async function writePage(
  ctx: RunContext,
  page: PlannedPage,
  vectors: Map<ChunkToEmbed, number[]>,
): Promise<void> {
  const { supabase, result } = ctx;

  // An embedding batch failed under part of this page (already reported).
  if (page.changed.some((chunk) => !vectors.has(chunk))) return;

  const byIndex = new Map(page.changed.map((chunk) => [chunk.chunkIndex, chunk]));
  const steps = planPageWrites(
    page.changed.map((chunk) => chunk.chunkIndex),
    // Chunks the page no longer produces: a tail it lost, or a focused table
    // it no longer has.
    staleChunkIndices(ctx.existing.get(page.sourceId), page.produced),
  );

  for (const step of steps) {
    if (step.kind === "upsert") {
      const chunk = byIndex.get(step.chunkIndex)!;
      const written = await upsertChunk(ctx, chunk, vectors.get(chunk)!, step.withMarkers ? page.markers : {});
      if (!written) return;
    } else if (step.kind === "trim") {
      const trimmed = logIfDbError(
        `gitbook stale chunks ${page.sourceId}`,
        await supabase
          .from("documents" as "products")
          .delete()
          .eq("source_type", "gitbook")
          .eq("source_id", page.sourceId)
          .in("chunk_index", step.chunkIndices),
      );
      if (!trimmed) {
        result.errors.push(`Stale chunk trim failed: ${page.sourceId}`);
        return;
      }
    } else {
      await recordMarkers(ctx, page.sourceId, page.markers, step.rewrite);
    }
  }
}

async function upsertChunk(
  ctx: RunContext,
  chunk: ChunkToEmbed,
  embedding: number[],
  markers: PageMarkers,
): Promise<boolean> {
  const { error } = await ctx.supabase
    .from("documents" as "products")
    .upsert(
      {
        source_type: "gitbook",
        source_id: chunk.sourceId,
        source_url: chunk.sourceUrl,
        title: chunk.title,
        chunk_index: chunk.chunkIndex,
        content: chunk.content,
        token_count: estimateTokens(chunk.content),
        metadata: { ...chunk.metadata, last_modified: markers.lastModified, page_hash: markers.pageHash },
        embedding: `[${embedding.join(",")}]`,
        content_hash: chunk.hash,
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>,
      { onConflict: "source_type,source_id,chunk_index" }
    );
  if (error) {
    ctx.result.errors.push(`Upsert ${chunk.sourceId}:${chunk.chunkIndex}: ${JSON.stringify(error)}`);
    return false;
  }
  ctx.result.processed++;
  return true;
}

/**
 * Store markers no chunk of the page carries, when there is no rewrite for
 * them to ride on — a page whose `<lastmod>` moved but whose text did not.
 * Metadata only, on the page's first chunk; content and embedding untouched.
 */
async function recordMarkers(
  ctx: RunContext,
  sourceId: string,
  want: PageMarkers,
  rewrite = false,
): Promise<void> {
  const missing = rewrite ? want : missingMarkers(ctx.existing.get(sourceId), want);
  if (!missing?.lastModified && !missing?.pageHash) return;

  const { data: row, error } = (await ctx.supabase
    .from("documents" as "products")
    .select("chunk_index, metadata")
    .eq("source_type", "gitbook")
    .eq("source_id", sourceId)
    .order("chunk_index")
    .limit(1)
    .maybeSingle()) as {
    data: { chunk_index: number; metadata: Record<string, unknown> | null } | null;
    error: unknown;
  };
  if (error || !row) {
    if (error) ctx.result.errors.push(`Marker read ${sourceId}: ${JSON.stringify(error)}`);
    return;
  }

  const { error: updateError } = await ctx.supabase
    .from("documents" as "products")
    .update({
      metadata: {
        ...(row.metadata ?? {}),
        ...(missing.lastModified ? { last_modified: missing.lastModified } : {}),
        ...(missing.pageHash ? { page_hash: missing.pageHash } : {}),
      },
    } as never)
    .eq("source_type", "gitbook")
    .eq("source_id", sourceId)
    .eq("chunk_index", row.chunk_index);
  if (updateError) ctx.result.errors.push(`Marker update ${sourceId}: ${JSON.stringify(updateError)}`);
}
