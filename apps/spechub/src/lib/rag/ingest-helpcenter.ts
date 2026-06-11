/**
 * Help Center (Intercom) Ingestion Pipeline
 *
 * Flow: collection URL → parse article links → fetch each article → chunk → embed → upsert
 *
 * Reuses chunking and embedding logic from the Gitbook pipeline.
 * Intercom articles are simpler (single-page, clean HTML) so no sitemap needed.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbeddings, contentHash, estimateTokens } from "./embeddings";
import {
  urlToBreadcrumb,
  hasSubstantialContent,
} from "./gitbook-fetcher";
import { normalizeTaxonomy, type TaxonomyMeta } from "./taxonomy";

/** Max characters per chunk */
const MAX_CHUNK_CHARS = 5000;
/** Min characters for a valid chunk */
const MIN_CHUNK_CHARS = 50;
/** Embedding batch size */
const EMBED_BATCH_SIZE = 20;
/** Max chars for embedding API */
const MAX_EMBED_CHARS = 21000;
/** Concurrency for page fetching */
const FETCH_CONCURRENCY = 5;

export interface IngestHelpcenterOptions {
  /** Collection URLs to discover articles from (Intercom SPA — may need fallback) */
  collectionUrls: string[];
  /** Direct article URLs to index (bypass collection page parsing) */
  articleUrls?: string[];
  /** Human-readable label (e.g., "Help Center") */
  label: string;
  /** Force re-embed even if unchanged */
  force?: boolean;
  /** Taxonomy metadata — solution/product_lines/models */
  taxonomy?: Partial<TaxonomyMeta>;
}

/**
 * Known EnGenius Help Center articles.
 * Intercom is a SPA, so server-side collection page parsing may fail.
 * This is the fallback list discovered via browser fetch.
 */
const KNOWN_ARTICLES: ArticleLink[] = [
  // Industry Vertical Best Practice
  { url: "https://helpcenter.engenius.ai/en/articles/10038354-chain-stores", title: "Chain Stores", collection: "Industry Vertical Best Practice" },
  { url: "https://helpcenter.engenius.ai/en/articles/10038436-business-offices", title: "Business Offices", collection: "Industry Vertical Best Practice" },
  { url: "https://helpcenter.engenius.ai/en/articles/10038466-hospitality", title: "Hospitality", collection: "Industry Vertical Best Practice" },
  { url: "https://helpcenter.engenius.ai/en/articles/10038516-campus", title: "Campus", collection: "Industry Vertical Best Practice" },
  { url: "https://helpcenter.engenius.ai/en/articles/10038541-service-apartment-or-dormitory", title: "Service Apartment or Dormitory", collection: "Industry Vertical Best Practice" },
  // Help Center Documents
  { url: "https://helpcenter.engenius.ai/en/articles/9951172-dual-wan-fail-over-or-load-balance", title: "Dual-WAN fail-over or Load Balance", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/9964275-engenius-avxpress", title: "EnGenius AVXpress", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/9964714-layer-7-application-firewall-rule", title: "Layer 7 Application Firewall Rule", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/9972388-layer-7-application-policy-base-route-pbr", title: "Layer 7 Application Policy-base Route (PBR)", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/9973344-l2-isolation", title: "L2 Isolation", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/9983199-active-directory", title: "Active Directory", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/9991261-secupoint-client-vpn-tool", title: "SecuPoint client VPN tool", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/9993774-wifi-calling", title: "WiFi Calling", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/10017326-zero-wait-dfs", title: "Zero-wait DFS", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/10061117-radsec", title: "RadSec", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/10071923-client-access-control", title: "Client Access Control", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/10077104-wi-fi-7-with-6-ghz", title: "Wi-Fi 7 with 6 GHz", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/10077525-mypsk", title: "MyPSK", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/10106219-vlan-import-and-export", title: "VLAN Import and Export", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/9963673-hierarchy-view-hv", title: "Hierarchy View (HV)", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/9964901-auto-vpn", title: "Auto-VPN", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/9967865-clone-network", title: "Clone Network", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/9982879-radius-server-load-balance", title: "Radius Server Load-balance", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/9990687-msp-portal", title: "MSP Portal", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/9991257-dynamic-vlan", title: "Dynamic VLAN", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/9991483-vlan-pooling", title: "VLAN Pooling", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/9991888-airguard", title: "AirGuard", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/10031213-pdu", title: "PDU", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/10034095-pdu-summary", title: "PDU Summary", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/10034105-pdu-outlet-autoreboot", title: "PDU Outlet AutoReboot", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/10034110-pdu-alerts", title: "PDU Alerts", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/10034114-pdu-diag-tool", title: "PDU Diag Tool", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/10034118-pdu-lcd-panel", title: "PDU LCD Panel", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/10034266-pdu-template", title: "PDU Template", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/10044862-vlan-trunking", title: "VLAN Trunking", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/10060595-device-template", title: "Device Template", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/10066787-switch-extender", title: "Switch Extender", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/9964598-l3-firewall", title: "L3 Firewall", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/9964642-nat-port-forwarding", title: "NAT & Port Forwarding", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/9992078-smartcasting", title: "SmartCasting", collection: "Help Center Documents" },
  { url: "https://helpcenter.engenius.ai/en/articles/10034102-pdu-outlet-scheduling", title: "PDU Outlet Scheduling", collection: "Help Center Documents" },
];

export interface IngestHelpcenterResult {
  processed: number;
  skipped: number;
  articles_fetched: number;
  articles_skipped: number;
  errors: string[];
}

interface ArticleLink {
  url: string;
  title: string;
  collection: string;
}

// ─── Fetching ────────────────────────────────────────────────────────────────

/**
 * Parse a collection page to extract article URLs and titles.
 */
async function parseCollectionPage(collectionUrl: string): Promise<ArticleLink[]> {
  const res = await fetch(collectionUrl, {
    headers: { "User-Agent": "SpecHub-Indexer/1.0", Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`Failed to fetch collection ${collectionUrl}: ${res.status}`);

  const html = await res.text();
  const articles: ArticleLink[] = [];

  // Extract collection name from the page
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const collectionName = titleMatch
    ? titleMatch[1].replace(/<[^>]+>/g, "").trim()
    : collectionUrl.split("/").pop()?.replace(/-/g, " ") || "Help Center";

  // Extract article links — Intercom uses <a> with href="/en/articles/..."
  const linkRegex = /<a[^>]+href="(\/en\/articles\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const path = match[1];
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    if (!text || text.length < 3) continue;

    const fullUrl = new URL(path, collectionUrl).href;
    // Deduplicate
    if (!articles.some((a) => a.url === fullUrl)) {
      articles.push({ url: fullUrl, title: text, collection: collectionName });
    }
  }

  return articles;
}

/**
 * Fetch a single Help Center article and extract clean text content.
 */
async function fetchArticle(url: string): Promise<{
  content: string;
  title: string;
  imageUrls: string[];
  sectionImages: Map<string, string[]>;
}> {
  const res = await fetch(url, {
    headers: { "User-Agent": "SpecHub-Indexer/1.0", Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`Failed to fetch article ${url}: ${res.status}`);

  const html = await res.text();

  // Extract article body — Intercom wraps content in <article> or specific class
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
    html.match(/<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i);
  const bodyHtml = articleMatch ? articleMatch[1] : html;

  // Extract title
  const titleMatch = bodyHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleMatch
    ? titleMatch[1].replace(/<[^>]+>/g, "").trim()
    : url.split("/").pop()?.replace(/-/g, " ") || "Untitled";

  // Extract image URLs
  const imageUrls: string[] = [];
  const imgRegex = /<img[^>]+src="([^"]+)"/gi;
  let imgMatch;
  while ((imgMatch = imgRegex.exec(bodyHtml)) !== null) {
    const src = imgMatch[1].replace(/&amp;/g, "&");
    if (src.startsWith("http") && !src.includes("avatar") && !src.includes("logo") && !src.includes("favicon")) {
      if (!imageUrls.includes(src)) imageUrls.push(src);
    }
  }

  // Build section-level image mapping
  const sectionImages = new Map<string, string[]>();
  const tokenRegex = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>|<img[^>]+src="([^"]+)"/gi;
  let currentSection = "_intro";
  sectionImages.set(currentSection, []);
  let tokenMatch;
  while ((tokenMatch = tokenRegex.exec(bodyHtml)) !== null) {
    if (tokenMatch[1]) {
      const heading = tokenMatch[2].replace(/<[^>]+>/g, "").trim();
      if (heading && heading.length >= 2) {
        currentSection = heading;
        if (!sectionImages.has(currentSection)) sectionImages.set(currentSection, []);
      }
    } else if (tokenMatch[3]) {
      const src = tokenMatch[3].replace(/&amp;/g, "&");
      if (src.startsWith("http") && !src.includes("avatar") && !src.includes("logo")) {
        const arr = sectionImages.get(currentSection) || [];
        if (!arr.includes(src)) { arr.push(src); sectionImages.set(currentSection, arr); }
      }
    }
  }

  // Convert to clean text
  const content = htmlToCleanText(bodyHtml);

  return { content, title, imageUrls, sectionImages };
}

/**
 * Convert Intercom article HTML to clean text.
 */
function htmlToCleanText(html: string): string {
  let text = html;

  // Remove unwanted elements
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  text = text.replace(/<header[\s\S]*?<\/header>/gi, "");
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, "");
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, "");
  text = text.replace(/<button[\s\S]*?<\/button>/gi, "");

  // Convert headings
  text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, content) => {
    const heading = content.replace(/<[^>]+>/g, "").trim();
    if (!heading) return "\n";
    return `\n${"#".repeat(Number(level))} ${heading}\n`;
  });

  // Convert lists
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "• $1\n");

  // Convert paragraphs and line breaks
  text = text.replace(/<\/p>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/div>/gi, "\n");

  // Convert table cells
  text = text.replace(/<\/td>/gi, " | ");
  text = text.replace(/<\/th>/gi, " | ");
  text = text.replace(/<\/tr>/gi, "\n");

  // Convert formatting
  text = text.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  text = text.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  text = text.replace(/<a[^>]*>(.*?)<\/a>/gi, "$1");

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#x27;/g, "'");
  text = text.replace(/&nbsp;/g, " ");

  // Remove Intercom noise
  text = text.replace(/Written by.*$/gm, "");
  text = text.replace(/Updated (over|about).*ago$/gm, "");
  text = text.replace(/Did this answer your question\?/gi, "");

  // Clean whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  return text;
}

// ─── Chunking ────────────────────────────────────────────────────────────────

interface ChunkResult {
  title: string;
  content: string;
  images: string[];
}

function chunkArticle(
  content: string,
  articleTitle: string,
  collection: string,
  sectionImages?: Map<string, string[]>
): ChunkResult[] {
  const contextPrefix = `[${collection} > ${articleTitle}]\n\n`;

  const sections = content.split(/\n(?=#{1,3} )/);
  const chunks: ChunkResult[] = [];

  function findImages(title: string): string[] {
    if (!sectionImages || sectionImages.size === 0) return [];
    if (sectionImages.has(title)) return sectionImages.get(title) || [];
    const lower = title.toLowerCase();
    for (const [key, urls] of sectionImages) {
      if (key.toLowerCase() === lower) return urls;
    }
    return [];
  }

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed || trimmed.length < MIN_CHUNK_CHARS) continue;

    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)/);
    const sectionTitle = headingMatch ? headingMatch[1].trim() : articleTitle;
    const images = findImages(sectionTitle);
    const fullContent = contextPrefix + trimmed;

    if (fullContent.length > MAX_CHUNK_CHARS) {
      // Split long sections
      const paragraphs = fullContent.split(/\n\n+/);
      let current = contextPrefix;
      let partIndex = 1;

      for (const para of paragraphs) {
        if (current.length + para.length > MAX_CHUNK_CHARS && current.length > contextPrefix.length) {
          chunks.push({ title: `${sectionTitle} (Part ${partIndex})`, content: current.trim(), images: partIndex === 1 ? images : [] });
          current = contextPrefix;
          partIndex++;
        }
        current += para + "\n\n";
      }
      if (current.trim().length > contextPrefix.length) {
        chunks.push({ title: partIndex > 1 ? `${sectionTitle} (Part ${partIndex})` : sectionTitle, content: current.trim(), images: [] });
      }
    } else {
      chunks.push({ title: sectionTitle, content: fullContent, images });
    }
  }

  // Fallback: entire content as one chunk
  if (chunks.length === 0 && content.trim().length >= MIN_CHUNK_CHARS) {
    const introImages = findImages("_intro");
    chunks.push({ title: articleTitle, content: contextPrefix + content.trim(), images: introImages });
  }

  return chunks;
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────

export async function ingestHelpcenter(
  options: IngestHelpcenterOptions
): Promise<IngestHelpcenterResult> {
  const { collectionUrls, label, force = false, taxonomy } = options;
  const errors: string[] = [];
  const tax = normalizeTaxonomy(taxonomy);
  let articlesSkipped = 0;

  // Step 1: Discover articles — try direct URLs first, then collection parsing, then known fallback
  let allArticles: ArticleLink[] = [];

  if (options.articleUrls && options.articleUrls.length > 0) {
    // Direct article URLs provided
    allArticles = options.articleUrls.map((url) => ({
      url,
      title: url.split("/").pop()?.replace(/-/g, " ") || "Article",
      collection: label,
    }));
  } else {
    // Try parsing collection pages
    for (const url of collectionUrls) {
      try {
        const articles = await parseCollectionPage(url);
        allArticles.push(...articles);
      } catch (err) {
        errors.push(`Collection parse failed (SPA): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Fallback to known articles if parsing failed (Intercom is SPA)
    if (allArticles.length === 0 && KNOWN_ARTICLES.length > 0) {
      allArticles = [...KNOWN_ARTICLES];
    }
  }

  // Deduplicate by URL
  const uniqueArticles = [...new Map(allArticles.map((a) => [a.url, a])).values()];

  if (uniqueArticles.length === 0) {
    return { processed: 0, skipped: 0, articles_fetched: 0, articles_skipped: 0, errors };
  }

  // Step 2: Fetch all articles with concurrency
  const fetchedArticles = new Map<string, { content: string; title: string; collection: string; imageUrls: string[]; sectionImages: Map<string, string[]> }>();

  for (let i = 0; i < uniqueArticles.length; i += FETCH_CONCURRENCY) {
    const batch = uniqueArticles.slice(i, i + FETCH_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (article) => {
        const fetched = await fetchArticle(article.url);
        return { url: article.url, collection: article.collection, ...fetched };
      })
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        const r = result.value;
        fetchedArticles.set(r.url, {
          content: r.content,
          title: r.title,
          collection: r.collection,
          imageUrls: r.imageUrls,
          sectionImages: r.sectionImages,
        });
      } else {
        errors.push(`Article fetch failed: ${result.reason}`);
      }
    }
  }

  // Step 3: Build chunks
  const supabase = createAdminClient();

  // Fetch existing hashes
  const { data: existingDocs } = await supabase
    .from("documents" as "products")
    .select("source_id, chunk_index, content_hash")
    .eq("source_type", "helpcenter") as {
    data: { source_id: string; chunk_index: number; content_hash: string }[] | null;
  };

  const hashMap = new Map<string, string>();
  for (const doc of existingDocs ?? []) {
    hashMap.set(`${doc.source_id}:${doc.chunk_index}`, doc.content_hash);
  }

  let skipped = 0;
  const allChunks: {
    sourceId: string;
    sourceUrl: string;
    chunkIndex: number;
    content: string;
    title: string;
    hash: string;
    metadata: Record<string, unknown>;
  }[] = [];

  for (const [url, article] of fetchedArticles) {
    if (!hasSubstantialContent(article.content)) {
      articlesSkipped++;
      continue;
    }

    const chunks = chunkArticle(article.content, article.title, article.collection, article.sectionImages);

    // Use article slug as source_id
    const urlPath = new URL(url).pathname.replace(/^\/en\/articles\//, "").replace(/\/$/, "");
    const sourceId = urlPath || "index";

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const hash = contentHash(chunk.content);

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
          helpcenter_label: label,
          collection: article.collection,
          article_title: article.title,
          has_images: chunk.images.length > 0,
          images_count: chunk.images.length,
          image_urls: chunk.images.length > 0 ? chunk.images : undefined,
          solution: tax.solution,
          product_lines: tax.product_lines,
          models: tax.models,
        },
      });
    }
  }

  if (allChunks.length === 0) {
    return { processed: 0, skipped, articles_fetched: fetchedArticles.size, articles_skipped: articlesSkipped, errors };
  }

  // Step 4: Embed and upsert
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
      errors.push(`Embedding batch failed: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j];
      const embedding = embeddings[j];

      const { error: upsertError } = await supabase
        .from("documents" as "products")
        .upsert(
          {
            source_type: "helpcenter",
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

  return {
    processed,
    skipped,
    articles_fetched: fetchedArticles.size,
    articles_skipped: articlesSkipped,
    errors,
  };
}
