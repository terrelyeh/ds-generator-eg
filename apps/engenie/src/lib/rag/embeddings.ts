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
 * Rough token count estimate (for metadata, not billing).
 * ~4 chars per token for English, ~2 for CJK.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
