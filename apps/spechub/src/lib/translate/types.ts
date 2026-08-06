export interface TranslateRequest {
  source: string | string[];
  targetLocale: string;
  contentType: "overview" | "features" | "spec_labels";
  productLine?: string;
}

export interface TranslateResult {
  translated: string | string[];
  provider: string;
  model: string;
}

export interface TranslateProvider {
  id: string;
  name: string;
  translate: (
    systemPrompt: string,
    userMessage: string
  ) => Promise<string>;
}

// NOTE: ids are stable internal keys (registry + availability wiring);
// only display names track the actual model generation. They are kept
// stable through the OpenRouter migration on purpose — renaming them
// would orphan stored selections and every translated_by value. Once Ask
// is on OpenRouter too, id and `openrouter` can collapse into one field
// and this whole aliasing problem disappears.
//
// `openrouter` slugs verified against GET https://openrouter.ai/api/v1/models
// (2026-08-06); each is the same model the direct client called, so
// switching routes changes the transport, not the output.
//
// Adding a model is now one line here — no new provider file.
export const AVAILABLE_PROVIDERS = [
  { id: "claude-sonnet", name: "Claude Sonnet 4.6", openrouter: "anthropic/claude-sonnet-4.6", vendor: "anthropic" },
  { id: "claude-opus", name: "Claude Opus 4.8", openrouter: "anthropic/claude-opus-4.8", vendor: "anthropic" },
  { id: "gpt-4o", name: "GPT-5.5", openrouter: "openai/gpt-5.5", vendor: "openai" },
  { id: "gemini-2.5-pro", name: "Gemini 3.1 Pro", openrouter: "google/gemini-3.1-pro-preview", vendor: "google" },
] as const;

export type ProviderId = (typeof AVAILABLE_PROVIDERS)[number]["id"];
export type Vendor = (typeof AVAILABLE_PROVIDERS)[number]["vendor"];

/** Settings key each vendor's direct (pre-OpenRouter) client reads. */
export const VENDOR_KEY: Record<Vendor, string> = {
  anthropic: "anthropic_api_key",
  openai: "openai_api_key",
  google: "google_ai_api_key",
};
