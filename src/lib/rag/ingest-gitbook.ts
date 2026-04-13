/**
 * Gitbook Ingestion Pipeline
 *
 * Flow: sitemap → fetch pages → image descriptions → chunk → hash → embed → upsert
 *
 * Chunks are split by headings (H1/H2/H3). Each chunk includes:
 * - Breadcrumb path for context (e.g., "Cloud Licensing > Device Pro License > FAQ")
 * - Image descriptions inline as [Image: ...]
 * - Source URL for citation
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbeddings, contentHash, estimateTokens } from "./embeddings";
import {
  fetchGitbookSitemap,
  fetchGitbookPage,
  urlToBreadcrumb,
  hasSubstantialContent,
} from "./gitbook-fetcher";
import { describeImages } from "./vision";

/** Max characters per chunk (~1500 tokens) */
const MAX_CHUNK_CHARS = 5000;
/** Min characters to be considered a valid chunk */
const MIN_CHUNK_CHARS = 50;
/** Embedding batch size */
const EMBED_BATCH_SIZE = 20;
/** Max chars for embedding API */
const MAX_EMBED_CHARS = 21000;
/** Concurrency for page fetching */
const FETCH_CONCURRENCY = 5;

export interface IngestGitbookOptions {
  /** Root URL of the Gitbook space */
  spaceUrl: string;
  /** Human-readable label for this space (e.g., "Cloud Licensing") */
  spaceLabel: string;
  /** Force re-embed even if content unchanged */
  force?: boolean;
  /** Enable image description via Vision API */
  enableVision?: boolean;
}

export interface IngestGitbookResult {
  processed: number;
  skipped: number;
  pages_fetched: number;
  pages_skipped: number;
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
 * Fetch pages concurrently with rate limiting.
 */
interface FetchedPage {
  content: string;
  imageUrls: string[];
  sectionImages: Map<string, string[]>;
  title: string;
}

async function fetchPagesWithConcurrency(
  urls: { url: string; lastModified?: string }[],
  concurrency: number,
  errors: string[]
): Promise<Map<string, FetchedPage>> {
  const results = new Map<string, FetchedPage>();

  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const fetched = await Promise.allSettled(
      batch.map(async (entry) => {
        const page = await fetchGitbookPage(entry.url);
        return { url: entry.url, ...page };
      })
    );

    for (const result of fetched) {
      if (result.status === "fulfilled") {
        results.set(result.value.url, {
          content: result.value.content,
          imageUrls: result.value.imageUrls,
          sectionImages: result.value.sectionImages,
          title: result.value.title,
        });
      } else {
        errors.push(`Fetch failed: ${result.reason}`);
      }
    }
  }

  return results;
}

/**
 * Main ingestion function for Gitbook spaces.
 */
export async function ingestGitbook(
  options: IngestGitbookOptions
): Promise<IngestGitbookResult> {
  const { spaceUrl, spaceLabel, force = false, enableVision = true } = options;
  const errors: string[] = [];
  let pagesSkipped = 0;
  let imagesDescribed = 0;

  // Step 1: Fetch sitemap
  let sitemapEntries: { url: string; lastModified?: string }[];
  try {
    sitemapEntries = await fetchGitbookSitemap(spaceUrl);
  } catch (err) {
    return {
      processed: 0, skipped: 0, pages_fetched: 0, pages_skipped: 0,
      images_described: 0,
      errors: [`Sitemap fetch failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  // Step 2: Fetch all pages
  const pages = await fetchPagesWithConcurrency(sitemapEntries, FETCH_CONCURRENCY, errors);

  // Step 3: Collect all image URLs across all pages for batch Vision processing
  const allImageUrls: string[] = [];
  for (const page of pages.values()) {
    allImageUrls.push(...page.imageUrls);
  }

  // Step 4: Describe images with Vision API
  let imageDescriptions = new Map<string, string | null>();
  if (enableVision && allImageUrls.length > 0) {
    try {
      imageDescriptions = await describeImages(allImageUrls);
      imagesDescribed = [...imageDescriptions.values()].filter((d) => d !== null).length;
    } catch (err) {
      errors.push(`Vision API error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Step 5: Build chunks from all pages
  // Use URL path as source_id (stable, unique per space)
  const baseUrl = spaceUrl.replace(/\/$/, "");
  const allChunks: ChunkToEmbed[] = [];

  // Fetch existing hashes for change detection
  const supabase = createAdminClient();
  const { data: existingDocs } = await supabase
    .from("documents" as "products")
    .select("source_id, chunk_index, content_hash")
    .eq("source_type", "gitbook") as {
    data: { source_id: string; chunk_index: number; content_hash: string }[] | null;
  };

  const hashMap = new Map<string, string>();
  for (const doc of existingDocs ?? []) {
    hashMap.set(`${doc.source_id}:${doc.chunk_index}`, doc.content_hash);
  }

  let skipped = 0;

  for (const [url, page] of pages) {
    // Skip empty/nav pages
    if (!hasSubstantialContent(page.content)) {
      pagesSkipped++;
      continue;
    }

    // Inject image descriptions into content
    const enrichedContent = injectImageDescriptions(
      page.content,
      page.imageUrls,
      imageDescriptions
    );

    // Build breadcrumb
    const breadcrumb = urlToBreadcrumb(url, baseUrl);

    // Chunk the content — pass sectionImages for chunk-level image mapping
    const chunks = chunkByHeadings(enrichedContent, breadcrumb, page.title, page.sectionImages);

    // Generate source_id from URL path (remove domain)
    const urlPath = new URL(url).pathname.replace(/^\//, "").replace(/\/$/, "");
    const sourceId = urlPath || "index";

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const hash = contentHash(chunk.content);

      // Skip unchanged chunks
      if (!force && hashMap.get(`${sourceId}:${i}`) === hash) {
        skipped++;
        continue;
      }

      allChunks.push({
        sourceId,
        sourceUrl: url,
        chunkIndex: i,
        content: chunk.content,
        title: chunk.title,
        hash,
        metadata: {
          space_url: baseUrl,
          space_label: spaceLabel,
          breadcrumb,
          page_title: page.title,
          has_images: chunk.images.length > 0,
          images_count: chunk.images.length,
          image_urls: chunk.images.length > 0 ? chunk.images : undefined,
        },
      });
    }
  }

  if (allChunks.length === 0) {
    return {
      processed: 0,
      skipped,
      pages_fetched: pages.size,
      pages_skipped: pagesSkipped,
      images_described: imagesDescribed,
      errors,
    };
  }

  // Step 6: Generate embeddings and upsert in batches
  let processed = 0;

  for (let i = 0; i < allChunks.length; i += EMBED_BATCH_SIZE) {
    const batch = allChunks.slice(i, i + EMBED_BATCH_SIZE);
    const texts = batch.map((c) =>
      c.content.length > MAX_EMBED_CHARS ? c.content.slice(0, MAX_EMBED_CHARS) : c.content
    );

    let embeddings: number[][];
    try {
      embeddings = await generateEmbeddings(texts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Embedding batch ${Math.floor(i / EMBED_BATCH_SIZE) + 1} failed: ${msg}`);
      continue;
    }

    // Upsert each chunk
    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j];
      const embedding = embeddings[j];

      const { error: upsertError } = await supabase
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
            metadata: chunk.metadata,
            embedding: `[${embedding.join(",")}]`,
            content_hash: chunk.hash,
            updated_at: new Date().toISOString(),
          } as Record<string, unknown>,
          { onConflict: "source_type,source_id,chunk_index" }
        );

      if (upsertError) {
        errors.push(`Upsert ${chunk.sourceId}:${chunk.chunkIndex}: ${JSON.stringify(upsertError)}`);
      } else {
        processed++;
      }
    }
  }

  // Step 7: Clean up stale chunks — if a page now produces fewer chunks than before,
  // remove the old excess chunks
  const newChunkKeys = new Set(allChunks.map((c) => `${c.sourceId}:${c.chunkIndex}`));
  const sourceIdsProcessed = new Set(allChunks.map((c) => c.sourceId));

  for (const doc of existingDocs ?? []) {
    if (
      sourceIdsProcessed.has(doc.source_id) &&
      !newChunkKeys.has(`${doc.source_id}:${doc.chunk_index}`)
    ) {
      // This chunk no longer exists — check if its source was re-processed
      const maxNewIndex = allChunks
        .filter((c) => c.sourceId === doc.source_id)
        .reduce((max, c) => Math.max(max, c.chunkIndex), -1);

      if (doc.chunk_index > maxNewIndex) {
        await supabase
          .from("documents" as "products")
          .delete()
          .eq("source_type", "gitbook")
          .eq("source_id", doc.source_id)
          .eq("chunk_index", doc.chunk_index);
      }
    }
  }

  return {
    processed,
    skipped,
    pages_fetched: pages.size,
    pages_skipped: pagesSkipped,
    images_described: imagesDescribed,
    errors,
  };
}
