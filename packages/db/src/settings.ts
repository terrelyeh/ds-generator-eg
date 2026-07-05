import { createAdminClient } from "./admin";

// In-process cache. API keys are read on every RAG request (once for the
// embedding, once for the LLM) but only change when an admin saves them in
// Settings — the 60s TTL bounds staleness per serverless instance, and the
// settings route calls invalidateApiKeyCache() so its own instance updates
// immediately. Other warm instances converge within the TTL.
const keyCache = new Map<string, { value: string | null; at: number }>();
const KEY_CACHE_TTL_MS = 60_000;

/** Drop all cached keys (call after writing app_settings). */
export function invalidateApiKeyCache(): void {
  keyCache.clear();
}

/**
 * Read an API key: first from Supabase app_settings, then from env var.
 * Resolved values are cached in-process for 60s.
 */
export async function getApiKey(
  settingsKey: string,
  envVarName: string
): Promise<string | null> {
  const hit = keyCache.get(settingsKey);
  if (hit && Date.now() - hit.at < KEY_CACHE_TTL_MS) return hit.value;

  let value: string | null = null;
  // Try DB first
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("app_settings" as "products")
      .select("value")
      .eq("key", settingsKey)
      .single() as { data: { value: string } | null };

    if (data?.value) value = data.value;
  } catch {
    // DB read failed, fall through to env var
  }

  // Fallback to env var
  value = value ?? process.env[envVarName] ?? null;
  keyCache.set(settingsKey, { value, at: Date.now() });
  return value;
}

/** Well-known settings keys and their env var fallbacks */
export const API_KEY_MAP = {
  anthropic_api_key: "ANTHROPIC_API_KEY",
  openai_api_key: "OPENAI_API_KEY",
  google_ai_api_key: "GOOGLE_AI_API_KEY",
  wifi_reghub_api_key: "WIFI_REGHUB_API_KEY",
} as const;
