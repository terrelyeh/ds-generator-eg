import OpenAI from "openai";
import { createHash } from "crypto";
import { getApiKey, API_KEY_MAP } from "@eg/db/settings";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Get an OpenAI client using the stored API key (DB first, env fallback).
 */
async function getOpenAIClient(): Promise<OpenAI> {
  const apiKey = await getApiKey("openai_api_key", API_KEY_MAP.openai_api_key);
  if (!apiKey) {
    throw new Error("OpenAI API key not configured. Set it in Settings > API Keys.");
  }
  return new OpenAI({ apiKey });
}

// LRU cache for single-text (query) embeddings. Embeddings are deterministic
// per model+text so entries never go stale; the cap bounds memory (~300 ×
// 12KB ≈ 3.6MB). Hit rate is high in practice: follow-up chips and example
// questions are re-submitted verbatim, and popular questions repeat across
// users. Ingest batches (generateEmbeddings) are NOT cached — one-shot texts.
const embedCache = new Map<string, number[]>();
const EMBED_CACHE_MAX = 300;

/**
 * Generate embedding for a single text string (LRU-cached).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const key = text.trim();
  const hit = embedCache.get(key);
  if (hit) {
    // Refresh recency: Map iterates in insertion order, so re-insert moves
    // this key to the back and eviction below always drops the oldest.
    embedCache.delete(key);
    embedCache.set(key, hit);
    return hit;
  }

  const client = await getOpenAIClient();
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  const embedding = response.data[0].embedding;

  embedCache.set(key, embedding);
  if (embedCache.size > EMBED_CACHE_MAX) {
    embedCache.delete(embedCache.keys().next().value!);
  }
  return embedding;
}

/**
 * Generate embeddings for multiple texts in a single API call (batch).
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = await getOpenAIClient();
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  // Sort by index to ensure order matches input
  return response.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

/**
 * Compute SHA-256 hash of content for change detection.
 */
export function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Rough token count (for metadata and for the embedding cap, not billing).
 *
 * One ratio for every script was the bug: 3.5 characters per token is
 * about right for English and wildly wrong for CJK, where cl100k spends
 * roughly a token per character. A 21 000-character Japanese chunk was
 * ~6 000 tokens by the old estimate and ~21 000 in fact — over the 8 192
 * limit of text-embedding-3-small, and OpenAI refuses the whole batch of
 * twenty for the one that is over.
 */
export function estimateTokens(text: string): number {
  let cjk = 0;
  for (const ch of text) {
    if (/[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(ch)) cjk += 1;
  }
  return Math.ceil(cjk * 1.2 + (text.length - cjk) / 4);
}

/** What the embedding model accepts per input. */
export const EMBED_TOKEN_LIMIT = 8192;
/** Where we cut, leaving room for the estimate being an estimate. */
export const EMBED_TOKEN_BUDGET = 7000;

/**
 * Text trimmed to what the embedding model will accept.
 *
 * Replaces six per-pipeline `MAX_EMBED_CHARS` constants (21 000, or 10 000)
 * that cut by character count — the right amount for English and up to
 * three times too much for CJK. Binary-searches the cut so the estimate,
 * not the character count, is what stays under budget.
 */
export function capForEmbedding(text: string): string {
  if (estimateTokens(text) <= EMBED_TOKEN_BUDGET) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (estimateTokens(text.slice(0, mid)) <= EMBED_TOKEN_BUDGET) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo);
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
