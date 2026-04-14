/**
 * Google Doc Ingestion Pipeline
 *
 * Flow: Google Drive API fetch → split by tab → chunk by headings → embed → upsert
 *
 * Uses the Google Drive MCP or direct fetch to get doc content.
 * Each tab in the doc becomes an independent source for better search precision.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbeddings, contentHash, estimateTokens } from "./embeddings";

/** Max characters per chunk */
const MAX_CHUNK_CHARS = 5000;
/** Min characters for a valid chunk */
const MIN_CHUNK_CHARS = 80;
/** Embedding batch size */
const EMBED_BATCH_SIZE = 20;
/** Max chars for embedding API */
const MAX_EMBED_CHARS = 21000;

export interface IngestGoogleDocOptions {
  /** Google Doc ID (from URL) */
  docId: string;
  /** Full document text content (pre-fetched via Drive API) */
  content: string;
  /** Document title */
  docTitle: string;
  /** Human-readable label for grouping */
  label?: string;
  /** Google Doc URL for citations */
  docUrl?: string;
  /** Force re-embed even if unchanged */
  force?: boolean;
}

export interface IngestGoogleDocResult {
  processed: number;
  skipped: number;
  tabs_found: number;
  errors: string[];
}

interface DocTab {
  name: string;
  slug: string;
  content: string;
}

// ─── Tab Splitting ──────────────────────────────────────────────────────────

/**
 * Split a Google Doc's content into tabs.
 * Tabs are identified by top-level headings that match the pattern:
 * # [vX.X] Feature Name
 * or the first major section of the document.
 */
function splitIntoTabs(content: string, docTitle: string): DocTab[] {
  // Look for tab markers: lines starting with "# [v" which indicate doc tabs
  const tabPattern = /^# \[v[\d.]+\]\s+(.+)$/gm;
  const matches: { index: number; title: string }[] = [];
  let match;

  while ((match = tabPattern.exec(content)) !== null) {
    matches.push({ index: match.index, title: match[0].replace(/^# /, "").trim() });
  }

  if (matches.length === 0) {
    // No tab markers found — treat entire doc as one tab
    return [{
      name: docTitle,
      slug: slugify(docTitle),
      content: content.trim(),
    }];
  }

  const tabs: DocTab[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
    const tabContent = content.slice(start, end).trim();

    if (tabContent.length < MIN_CHUNK_CHARS) continue;

    tabs.push({
      name: matches[i].title,
      slug: slugify(matches[i].title),
      content: tabContent,
    });
  }

  return tabs;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[v[\d.]+\]\s*/g, "") // remove version tags
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-") // non-alphanumeric to dash
    .replace(/^-|-$/g, "") // trim dashes
    .slice(0, 60);
}

// ─── Chunking ───────────────────────────────────────────────────────────────

interface ChunkResult {
  title: string;
  content: string;
}

function chunkByHeadings(content: string, tabName: string): ChunkResult[] {
  const contextPrefix = `[${tabName}]\n\n`;

  // Split on H1/H2/H3 markers
  const sections = content.split(/\n(?=#{1,3} )/);
  const chunks: ChunkResult[] = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed || trimmed.length < MIN_CHUNK_CHARS) continue;

    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)/);
    const sectionTitle = headingMatch ? headingMatch[1].trim() : tabName;

    // Clean: remove image placeholders like [imageN]: <>
    const cleaned = trimmed.replace(/\[image\d+\]:\s*<>/g, "").trim();
    if (cleaned.length < MIN_CHUNK_CHARS) continue;

    const fullContent = contextPrefix + cleaned;

    if (fullContent.length > MAX_CHUNK_CHARS) {
      // Split long sections by paragraphs
      const paragraphs = fullContent.split(/\n\n+/);
      let current = contextPrefix;
      let partIndex = 1;

      for (const para of paragraphs) {
        if (current.length + para.length > MAX_CHUNK_CHARS && current.length > contextPrefix.length) {
          chunks.push({ title: `${sectionTitle} (Part ${partIndex})`, content: current.trim() });
          current = contextPrefix;
          partIndex++;
        }
        current += para + "\n\n";
      }
      if (current.trim().length > contextPrefix.length) {
        chunks.push({
          title: partIndex > 1 ? `${sectionTitle} (Part ${partIndex})` : sectionTitle,
          content: current.trim(),
        });
      }
    } else {
      chunks.push({ title: sectionTitle, content: fullContent });
    }
  }

  // Fallback: entire content as one chunk
  if (chunks.length === 0 && content.trim().length >= MIN_CHUNK_CHARS) {
    const cleaned = content.replace(/\[image\d+\]:\s*<>/g, "").trim();
    chunks.push({ title: tabName, content: contextPrefix + cleaned });
  }

  return chunks;
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

export async function ingestGoogleDoc(
  options: IngestGoogleDocOptions
): Promise<IngestGoogleDocResult> {
  const { docId, content, docTitle, label, docUrl, force = false } = options;
  const errors: string[] = [];

  // Step 1: Split into tabs
  const tabs = splitIntoTabs(content, docTitle);

  if (tabs.length === 0) {
    return { processed: 0, skipped: 0, tabs_found: 0, errors: ["No content found in document"] };
  }

  // Step 2: Build chunks from all tabs
  const supabase = createAdminClient();

  // Fetch existing hashes
  const { data: existingDocs } = await supabase
    .from("documents" as "products")
    .select("source_id, chunk_index, content_hash")
    .eq("source_type", "google_doc") as {
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

  for (const tab of tabs) {
    const chunks = chunkByHeadings(tab.content, tab.name);
    const sourceId = `${docId}/${tab.slug}`;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const hash = contentHash(chunk.content);

      if (!force && hashMap.get(`${sourceId}:${i}`) === hash) {
        skipped++;
        continue;
      }

      allChunks.push({
        sourceId,
        sourceUrl: docUrl || `https://docs.google.com/document/d/${docId}`,
        chunkIndex: i,
        content: chunk.content,
        title: chunk.title,
        hash,
        metadata: {
          doc_id: docId,
          doc_title: docTitle,
          tab_name: tab.name,
          doc_label: label || docTitle,
        },
      });
    }
  }

  if (allChunks.length === 0) {
    return { processed: 0, skipped, tabs_found: tabs.length, errors };
  }

  // Step 3: Embed and upsert
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
            source_type: "google_doc",
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
    tabs_found: tabs.length,
    errors,
  };
}
