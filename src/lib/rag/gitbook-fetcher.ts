/**
 * Gitbook Fetcher — Fetch sitemap and page content from a Gitbook space.
 *
 * Gitbook is a SPA, so we rely on:
 * 1. sitemap.xml / sitemap-pages.xml for discovering all page URLs
 * 2. Direct URL fetch for page content (Gitbook renders server-side for crawlers)
 */

export interface GitbookPage {
  url: string;
  lastModified?: string;
  /** Breadcrumb path derived from URL segments */
  breadcrumb: string[];
  /** Raw HTML/text content fetched from the page */
  content: string;
  /** Image URLs found on the page */
  imageUrls: string[];
  /** Page title (first H1/H2 or derived from URL) */
  title: string;
}

/**
 * Parse a sitemap XML and extract all <loc> URLs + optional <lastmod>.
 */
function parseSitemap(xml: string): { url: string; lastModified?: string }[] {
  const entries: { url: string; lastModified?: string }[] = [];

  // Check if this is a sitemap index (contains other sitemaps)
  const sitemapIndexMatch = xml.match(/<sitemapindex[\s\S]*?<\/sitemapindex>/);
  if (sitemapIndexMatch) {
    // Extract sitemap locations from index
    const locRegex = /<loc>(.*?)<\/loc>/g;
    let match;
    while ((match = locRegex.exec(xml)) !== null) {
      entries.push({ url: match[1].trim() });
    }
    return entries;
  }

  // Regular sitemap — extract URL entries
  const urlRegex = /<url>\s*<loc>(.*?)<\/loc>(?:\s*<lastmod>(.*?)<\/lastmod>)?/g;
  let match;
  while ((match = urlRegex.exec(xml)) !== null) {
    entries.push({
      url: match[1].trim(),
      lastModified: match[2]?.trim(),
    });
  }

  return entries;
}

/**
 * Discover all page URLs in a Gitbook space by fetching its sitemap.
 *
 * @param spaceUrl - The root URL of the Gitbook space (e.g., https://doc.engenius.ai/cloud-licensing)
 * @returns Array of page entries with URLs and lastModified dates
 */
export async function fetchGitbookSitemap(
  spaceUrl: string
): Promise<{ url: string; lastModified?: string }[]> {
  // Normalize URL: remove trailing slash
  const baseUrl = spaceUrl.replace(/\/$/, "");

  // Try space-specific sitemap first: {baseUrl}/sitemap-pages.xml
  const sitemapUrl = `${baseUrl}/sitemap-pages.xml`;

  const res = await fetch(sitemapUrl, {
    headers: { "User-Agent": "SpecHub-Indexer/1.0" },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch sitemap at ${sitemapUrl}: ${res.status}`);
  }

  const xml = await res.text();
  const entries = parseSitemap(xml);

  if (entries.length === 0) {
    throw new Error(`No pages found in sitemap: ${sitemapUrl}`);
  }

  return entries;
}

/**
 * Resolve a Gitbook image URL to a directly fetchable URL.
 * Gitbook proxy URLs (/~gitbook/image?url=...&sign=...) return 400 for server-side fetch.
 * We extract the original URL from the `url` query parameter instead.
 */
function resolveGitbookImageUrl(src: string): string | null {
  // Skip non-image assets (favicons, logos, SVG icons)
  if (src.includes("favicon") || src.includes("logo") || src.endsWith(".svg")) {
    return null;
  }

  // Case 1: Gitbook proxy URL — extract original from query param
  if (src.includes("/~gitbook/image") || src.includes("~gitbook/image")) {
    try {
      // HTML entities in src may break URL parsing — decode first
      const decoded = src.replace(/&amp;/g, "&");
      // Extract the `url=` param value manually to preserve %2F encoding.
      // URLSearchParams.get() auto-decodes %2F to /, which breaks gitbook file URLs.
      const urlParamMatch = decoded.match(/[?&]url=([^&]+)/);
      if (urlParamMatch) {
        // Only decode the outer percent-encoding (the param value encoding),
        // which gives us the original URL with %2F intact
        return decodeURIComponent(urlParamMatch[1]);
      }
    } catch {
      // Failed to parse, skip
    }
    return null;
  }

  // Case 2: Direct gitbook files URL — already fetchable
  if (src.includes("files.gitbook.io") || src.includes("gitbook-x-prod")) {
    return src.startsWith("http") ? src : null;
  }

  // Case 3: Other external images
  if (src.startsWith("http") && (src.includes(".png") || src.includes(".jpg") || src.includes(".jpeg") || src.includes(".webp"))) {
    return src;
  }

  return null;
}

/**
 * Fetch a single Gitbook page and extract its content.
 * Returns raw text content, image URLs, and title.
 */
export async function fetchGitbookPage(url: string): Promise<{
  content: string;
  imageUrls: string[];
  title: string;
}> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "SpecHub-Indexer/1.0",
      Accept: "text/html",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch page ${url}: ${res.status}`);
  }

  const html = await res.text();

  // Extract image URLs from the HTML
  // Gitbook has two URL patterns:
  // 1. Proxy: /~gitbook/image?url=<encoded-original>&sign=... — returns 400 for server-side fetch
  // 2. Original: https://xxxxx-files.gitbook.io/~/files/v0/b/... — directly fetchable
  // We extract original URLs from proxy params, or use direct URLs.
  const imageUrls: string[] = [];
  const imgRegex = /<img[^>]+src="([^"]+)"/g;
  let imgMatch;
  while ((imgMatch = imgRegex.exec(html)) !== null) {
    // Raw src from HTML may contain &amp; — decode HTML entities only (NOT URL-decode here,
    // because resolveGitbookImageUrl will handle URL decoding to preserve %2F in paths)
    const src = imgMatch[1].replace(/&amp;/g, "&");
    const resolved = resolveGitbookImageUrl(src);
    if (resolved && !imageUrls.includes(resolved)) {
      imageUrls.push(resolved);
    }
  }

  // Convert HTML to clean text content
  const textContent = htmlToText(html);

  // Extract title: first heading or from URL
  const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i) ||
    html.match(/<h2[^>]*>(.*?)<\/h2>/i);
  const title = titleMatch
    ? stripHtmlTags(titleMatch[1]).trim()
    : urlToTitle(url);

  return { content: textContent, imageUrls, title };
}

/**
 * Derive breadcrumb segments from a Gitbook page URL.
 * e.g., https://doc.engenius.ai/cloud-licensing/device-pro-license-overview/pro-license
 * → ["Cloud Licensing", "Device Pro License Overview", "Pro License"]
 */
export function urlToBreadcrumb(url: string, spaceRootUrl: string): string[] {
  const baseUrl = spaceRootUrl.replace(/\/$/, "");
  const path = url.replace(baseUrl, "").replace(/^\//, "");

  if (!path) return [];

  return path.split("/").map((segment) =>
    segment
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}

/**
 * Convert a URL slug to a readable title.
 */
function urlToTitle(url: string): string {
  const lastSegment = url.split("/").pop() || "";
  return lastSegment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Strip HTML tags from a string.
 */
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

/**
 * Convert HTML to clean text, preserving structure.
 * Handles common Gitbook HTML patterns.
 */
function htmlToText(html: string): string {
  // Remove script and style tags entirely
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  text = text.replace(/<header[\s\S]*?<\/header>/gi, "");
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, "");

  // Convert headings to text with markdown-style markers
  text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "\n# $1\n");
  text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "\n## $1\n");
  text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "\n### $1\n");
  text = text.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "\n#### $1\n");

  // Convert lists
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, "• $1\n");

  // Convert paragraphs and divs to newlines
  text = text.replace(/<\/p>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/div>/gi, "\n");

  // Convert table cells
  text = text.replace(/<\/td>/gi, " | ");
  text = text.replace(/<\/th>/gi, " | ");
  text = text.replace(/<\/tr>/gi, "\n");

  // Convert bold/strong
  text = text.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  text = text.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");

  // Convert links — keep text but strip href
  text = text.replace(/<a[^>]*>(.*?)<\/a>/gi, "$1");

  // Strip remaining HTML tags
  text = stripHtmlTags(text);

  // Decode HTML entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#x20;/g, " ");
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, " ");

  // Clean up whitespace
  text = text.replace(/[ \t]+/g, " "); // collapse horizontal whitespace
  text = text.replace(/\n{3,}/g, "\n\n"); // max 2 consecutive newlines
  text = text.trim();

  return text;
}

/**
 * Check if a page has substantial content (not just a navigation/index page).
 * Returns false for pages with very little text content.
 */
export function hasSubstantialContent(content: string): boolean {
  // Strip whitespace and count meaningful characters
  const cleaned = content.replace(/\s+/g, " ").trim();
  // Pages with less than 100 chars of actual content are likely just index/nav pages
  return cleaned.length > 100;
}
