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
// only display names track the actual model generation.
export const AVAILABLE_PROVIDERS = [
  { id: "claude-sonnet", name: "Claude Sonnet 4.6" },
  { id: "claude-opus", name: "Claude Opus 4.8" },
  { id: "gpt-4o", name: "GPT-5.5" },
  { id: "gemini-2.5-pro", name: "Gemini 3.1 Pro" },
] as const;

export type ProviderId = (typeof AVAILABLE_PROVIDERS)[number]["id"];
