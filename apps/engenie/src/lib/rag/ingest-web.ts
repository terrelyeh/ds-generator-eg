/**
 * Generic Web Page Ingestion Pipeline
 *
 * Flow: page URL → extract clean markdown → chunk → embed → upsert (source_type "web").
 *
 * Layered extraction cascade (per product decision — Firecrawl → Jina → fetch):
 *   1. Firecrawl   — only if FIRECRAWL_API_KEY is set; best quality, handles JS,
 *                    strips boilerplate (onlyMainContent).
 *   2. Jina Reader — `r.jina.ai/<url>`; free, no key required, handles JS-rendered
 *                    pages, returns markdown. (JINA_API_KEY only raises rate limit.)
 *   3. plain fetch — last-resort regex HTML→text; static HTML only.
 *
 * Each page falls through to the next extractor until one returns substantial
 * content, so a single page can never come back empty just because one engine
 * was unavailable or rate-limited.
 */

import { createAdminClient } from "@eg/db/admin";
import { generateEmbeddings, contentHash, estimateTokens } from "./embeddings";
import { hasSubstantialContent } from "./gitbook-fetcher";
import { normalizeTaxonomy, type TaxonomyMeta } from "./taxonomy";

const MAX_CHUNK_CHARS = 5000;
const MIN_CHUNK_CHARS = 50;
const EMBED_BATCH_SIZE = 20;
const MAX_EMBED_CHARS = 21000;
const FETCH_CONCURRENCY = 3;

export interface IngestWebOptions {
  /** Page URLs to index (each indexed as its own source). */
  pageUrls: string[];
  /** Optional human-readable label shown in the knowledge base / chunk prefix. */
  label?: string;
  /** Force re-embed even if content unchanged. */
  force?: boolean;
  /** Taxonomy metadata — solution/product_lines/models. */
  taxonomy?: Partial<TaxonomyMeta>;
}

export interface IngestWebResult {
  processed: number;
  skipped: number;
  pages_fetched: number;
  pages_skipped: number;
  errors: string[];
  /** How many pages were extracted by each engine (firecrawl/jina/fetch). */
  methods: Record<string, number>;
}

interface ExtractResult {
  title: string;
  content: string;
  method: "firecrawl" | "jina" | "fetch";
}

// ── URL helpers ───────────────────────────────────────────────────────────────

/** Ensure a scheme so bare "example.com/x" still resolves. */
function normalizeUrl(input: string): string {
  const u = input.trim();
  if (!u) return u;
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

/**
 * SSRF guard for admin-supplied URLs. The plain-fetch fallback runs from our
 * own serverless runtime, so internal targets (cloud metadata, loopback,
 * RFC1918) must never be fetchable — even by a knowledge.edit admin.
 * Hostname-based only: DNS-rebinding (public name → private A record) is out
 * of scope for this internal, admin-gated feature.
 */
function isSafePublicUrl(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  // IPv6: loopback / unspecified / link-local / unique-local
  if (host.includes(":")) {
    return !(host === "::" || host === "::1" || /^(fe80|fc|fd)/i.test(host));
  }
  // Whole-number or hex IPv4 forms (http://2130706433/, http://0x7f000001/)
  if (/^\d+$/.test(host) || /^0x/i.test(host)) return false;
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) return false;
  }
  return true;
}

/**
 * Colon-free, stable source_id (the GET /api/documents list splits
 * "type:source_id" on the first ":", so a raw URL with "https://" would break
 * it). hostname + pathname is human-readable and unique per page.
 */
function sourceIdFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const id = (u.hostname + u.pathname).toLowerCase().replace(/\/+$/, "");
    return id || u.hostname.toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//i, "").replace(/[:?#].*$/, "").toLowerCase();
  }
}

function titleFromMarkdown(md: string): string {
  return md.match(/^#\s+(.+)$/m)?.[1]?.replace(/[#*`]/g, "").trim() || "";
}

// ── Extraction cascade ─────────────────────────────────────────────────────────

async function extractWithFirecrawl(url: string): Promise<ExtractResult | null> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { markdown?: string; metadata?: { title?: string } };
    };
    const md = json?.data?.markdown;
    if (!md || md.trim().length < MIN_CHUNK_CHARS) return null;
    return {
      title: json?.data?.metadata?.title || titleFromMarkdown(md) || url,
      content: md.trim(),
      method: "firecrawl",
    };
  } catch {
    return null;
  }
}

async function extractWithJina(url: string): Promise<ExtractResult | null> {
  try {
    const headers: Record<string, string> = {
      "X-Return-Format": "markdown",
      Accept: "text/plain",
      "User-Agent": "SpecHub-Indexer/1.0",
    };
    if (process.env.JINA_API_KEY) headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;

    const res = await fetch(`https://r.jina.ai/${url}`, { headers });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.trim().length < MIN_CHUNK_CHARS) return null;

    // Jina prepends a header: "Title: …\nURL Source: …\nMarkdown Content:\n…"
    const title = text.match(/^Title:\s*(.+)$/m)?.[1]?.trim();
    const mdIdx = text.indexOf("Markdown Content:");
    const content = (mdIdx >= 0 ? text.slice(mdIdx + "Markdown Content:".length) : text).trim();
    if (content.length < MIN_CHUNK_CHARS) return null;
    return { title: title || titleFromMarkdown(content) || url, content, method: "jina" };
  } catch {
    return null;
  }
}

/** Convert arbitrary HTML to clean markdown-ish text (last-resort). */
function htmlToText(html: string): string {
  let t = html;
  // Drop non-content elements
  t = t.replace(/<script[\s\S]*?<\/script>/gi, "");
  t = t.replace(/<style[\s\S]*?<\/style>/gi, "");
  t = t.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  t = t.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  t = t.replace(/<header[\s\S]*?<\/header>/gi, "");
  t = t.replace(/<footer[\s\S]*?<\/footer>/gi, "");
  t = t.replace(/<aside[\s\S]*?<\/aside>/gi, "");
  t = t.replace(/<form[\s\S]*?<\/form>/gi, "");
  t = t.replace(/<svg[\s\S]*?<\/svg>/gi, "");
  t = t.replace(/<button[\s\S]*?<\/button>/gi, "");
  // Structure → markdown
  t = t.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, lvl, c) => {
    const h = c.replace(/<[^>]+>/g, "").trim();
    return h ? `\n${"#".repeat(Number(lvl))} ${h}\n` : "\n";
  });
  t = t.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "• $1\n");
  t = t.replace(/<\/p>/gi, "\n");
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<\/div>/gi, "\n");
  t = t.replace(/<\/td>/gi, " | ");
  t = t.replace(/<\/th>/gi, " | ");
  t = t.replace(/<\/tr>/gi, "\n");
  t = t.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  t = t.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  t = t.replace(/<a[^>]*>(.*?)<\/a>/gi, "$1");
  t = t.replace(/<[^>]+>/g, "");
  // Decode common entities
  t = t
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  // Whitespace cleanup
  t = t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

async function extractWithFetch(url: string): Promise<ExtractResult | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SpecHub-Indexer/1.0)",
        Accept: "text/html",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")
      .replace(/<[^>]+>/g, "")
      .trim();
    // Prefer the main content region, else fall back to body / whole doc
    const main =
      html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ||
      html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ||
      html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ||
      html;
    const content = htmlToText(main);
    if (content.length < MIN_CHUNK_CHARS) return null;
    return { title: title || titleFromMarkdown(content) || url, content, method: "fetch" };
  } catch {
    return null;
  }
}

async function extractPage(url: string): Promise<ExtractResult | null> {
  return (
    (await extractWithFirecrawl(url)) ||
    (await extractWithJina(url)) ||
    (await extractWithFetch(url))
  );
}

// ── Chunking ────────────────────────────────────────────────────────────────

function chunkPage(content: string, title: string, label?: string): { title: string; content: string }[] {
  const prefix = `[${label ? label + " > " : ""}${title}]\n\n`;
  const sections = content.split(/\n(?=#{1,3} )/);
  const chunks: { title: string; content: string }[] = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed || trimmed.length < MIN_CHUNK_CHARS) continue;

    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)/);
    const sectionTitle = headingMatch ? headingMatch[1].replace(/[#*`]/g, "").trim() : title;
    const full = prefix + trimmed;

    if (full.length > MAX_CHUNK_CHARS) {
      const paragraphs = full.split(/\n\n+/);
      let current = prefix;
      let part = 1;
      for (const para of paragraphs) {
        if (current.length + para.length > MAX_CHUNK_CHARS && current.length > prefix.length) {
          chunks.push({ title: `${sectionTitle} (Part ${part})`, content: current.trim() });
          current = prefix;
          part++;
        }
        current += para + "\n\n";
      }
      if (current.trim().length > prefix.length) {
        chunks.push({ title: part > 1 ? `${sectionTitle} (Part ${part})` : sectionTitle, content: current.trim() });
      }
    } else {
      chunks.push({ title: sectionTitle, content: full });
    }
  }

  if (chunks.length === 0 && content.trim().length >= MIN_CHUNK_CHARS) {
    chunks.push({ title, content: prefix + content.trim() });
  }
  return chunks;
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export async function ingestWeb(options: IngestWebOptions): Promise<IngestWebResult> {
  const { pageUrls, label, force = false, taxonomy } = options;
  const tax = normalizeTaxonomy(taxonomy);
  const errors: string[] = [];
  const methods: Record<string, number> = {};
  let pagesSkipped = 0;

  const urls = [...new Set((pageUrls ?? []).map(normalizeUrl).filter(Boolean))].filter((u) => {
    if (isSafePublicUrl(u)) return true;
    errors.push(`Blocked non-public URL: ${u}`);
    return false;
  });
  if (urls.length === 0) {
    return { processed: 0, skipped: 0, pages_fetched: 0, pages_skipped: 0, errors, methods };
  }

  // Step 1 — extract every page (with concurrency)
  const fetched = new Map<string, ExtractResult & { url: string }>();
  for (let i = 0; i < urls.length; i += FETCH_CONCURRENCY) {
    const batch = urls.slice(i, i + FETCH_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (url) => {
        const r = await extractPage(url);
        if (!r) throw new Error(`No content extracted: ${url}`);
        return { url, ...r };
      }),
    );
    for (const r of results) {
      if (r.status === "fulfilled") fetched.set(r.value.url, r.value);
      else errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
    }
  }

  // Step 2 — load existing hashes for change detection
  const supabase = createAdminClient();
  const { data: existingDocs } = (await supabase
    .from("documents" as "products")
    .select("source_id, chunk_index, content_hash")
    .eq("source_type", "web")) as {
    data: { source_id: string; chunk_index: number; content_hash: string }[] | null;
  };
  const hashMap = new Map<string, string>();
  for (const d of existingDocs ?? []) hashMap.set(`${d.source_id}:${d.chunk_index}`, d.content_hash);

  // Step 3 — build chunks
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

  for (const [url, page] of fetched) {
    if (!hasSubstantialContent(page.content)) {
      pagesSkipped++;
      continue;
    }
    methods[page.method] = (methods[page.method] ?? 0) + 1;

    const sourceId = sourceIdFromUrl(url);
    const chunks = chunkPage(page.content, page.title, label);

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
          web_label: label || (() => { try { return new URL(url).hostname; } catch { return url; } })(),
          page_title: page.title,
          page_url: url,
          extract_method: page.method,
          solution: tax.solution,
          product_lines: tax.product_lines,
          models: tax.models,
        },
      });
    }
  }

  if (allChunks.length === 0) {
    return { processed: 0, skipped, pages_fetched: fetched.size, pages_skipped: pagesSkipped, errors, methods };
  }

  // Step 4 — embed and upsert
  let processed = 0;
  for (let i = 0; i < allChunks.length; i += EMBED_BATCH_SIZE) {
    const batch = allChunks.slice(i, i + EMBED_BATCH_SIZE);
    const texts = batch.map((c) =>
      c.content.length > MAX_EMBED_CHARS ? c.content.slice(0, MAX_EMBED_CHARS) : c.content,
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
      const { error: upsertError } = await supabase.from("documents" as "products").upsert(
        {
          source_type: "web",
          source_id: chunk.sourceId,
          source_url: chunk.sourceUrl,
          title: chunk.title,
          chunk_index: chunk.chunkIndex,
          content: chunk.content,
          token_count: estimateTokens(chunk.content),
          metadata: chunk.metadata,
          embedding: `[${embeddings[j].join(",")}]`,
          content_hash: chunk.hash,
          updated_at: new Date().toISOString(),
        } as Record<string, unknown>,
        { onConflict: "source_type,source_id,chunk_index" },
      );
      if (upsertError) errors.push(`Upsert ${chunk.sourceId}:${chunk.chunkIndex}: ${JSON.stringify(upsertError)}`);
      else processed++;
    }
  }

  return { processed, skipped, pages_fetched: fetched.size, pages_skipped: pagesSkipped, errors, methods };
}
