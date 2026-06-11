import OpenAI from "openai";
import { createHash } from "crypto";
import { getApiKey, API_KEY_MAP } from "@/lib/settings";

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

/**
 * Generate embedding for a single text string.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const client = await getOpenAIClient();
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return response.data[0].embedding;
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
