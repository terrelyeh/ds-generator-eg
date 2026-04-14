import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Read an API key: first from Supabase app_settings, then from env var.
 */
export async function getApiKey(
  settingsKey: string,
  envVarName: string
): Promise<string | null> {
  // Try DB first
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("app_settings" as "products")
      .select("value")
      .eq("key", settingsKey)
      .single() as { data: { value: string } | null };

    if (data?.value) return data.value;
  } catch {
    // DB read failed, fall through to env var
  }

  // Fallback to env var
  return process.env[envVarName] ?? null;
}

/** Well-known settings keys and their env var fallbacks */
export const API_KEY_MAP = {
  anthropic_api_key: "ANTHROPIC_API_KEY",
  openai_api_key: "OPENAI_API_KEY",
  google_ai_api_key: "GOOGLE_AI_API_KEY",
  wifi_reghub_api_key: "WIFI_REGHUB_API_KEY",
} as const;
