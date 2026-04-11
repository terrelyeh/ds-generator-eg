import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    .in("key", ["anthropic_api_key", "openai_api_key", "google_ai_api_key"]) as {
    data: { key: string }[] | null;
  };

  const dbKeys = new Set((data ?? []).map((r) => r.key));

  const providers = {
    "claude-sonnet": dbKeys.has("anthropic_api_key") || !!process.env.ANTHROPIC_API_KEY,
    "claude-opus": dbKeys.has("anthropic_api_key") || !!process.env.ANTHROPIC_API_KEY,
    "gpt-4o": dbKeys.has("openai_api_key") || !!process.env.OPENAI_API_KEY,
    "gemini-2.5-pro": dbKeys.has("google_ai_api_key") || !!process.env.GOOGLE_AI_API_KEY,
  };

  return NextResponse.json(providers);
}
