import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";

/**
 * GET /api/settings/providers
 * Returns which AI translation providers have API keys configured.
 * Checks both DB (app_settings) and env vars.
 */
export async function GET() {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("app_settings" as "products")
    .select("key")
    .in("key", [
      "openrouter_api_key",
      "anthropic_api_key",
      "openai_api_key",
      "google_ai_api_key",
    ]) as {
    data: { key: string }[] | null;
  };

  const dbKeys = new Set((data ?? []).map((r) => r.key));

  // One OpenRouter key reaches every vendor, so it satisfies all three at
  // once. Only when it's absent does availability fall back to asking
  // whether each vendor's own key happens to be configured.
  const openrouter = dbKeys.has("openrouter_api_key") || !!process.env.OPENROUTER_API_KEY;

  const anthropic = openrouter || dbKeys.has("anthropic_api_key") || !!process.env.ANTHROPIC_API_KEY;
  const openai = openrouter || dbKeys.has("openai_api_key") || !!process.env.OPENAI_API_KEY;
  const google = openrouter || dbKeys.has("google_ai_api_key") || !!process.env.GOOGLE_AI_API_KEY;

  // Availability is keyed by the checkKey ids each consumer references.
  // Ask SpecHub (ask-chat) checks the latest-gen ids; the translate UI
  // still references the older ids — return BOTH so neither breaks. All
  // ids for the same vendor resolve to the same underlying API key.
  const providers = {
    // Claude (shared ids across Ask + translate)
    "claude-sonnet": anthropic,
    "claude-opus": anthropic,
    // OpenAI — Ask: gpt-5.5 | translate: gpt-4o
    "gpt-5.5": openai,
    "gpt-4o": openai,
    // Gemini — Ask: gemini-3.5-flash | translate: gemini-2.5-pro
    "gemini-3.5-flash": google,
    "gemini-2.5-pro": google,
  };

  return NextResponse.json(providers);
}
