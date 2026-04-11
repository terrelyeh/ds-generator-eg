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

export const AVAILABLE_PROVIDERS = [
  { id: "claude-sonnet", name: "Claude Sonnet 4.6" },
  { id: "claude-opus", name: "Claude Opus 4.6" },
  { id: "gpt-4o", name: "GPT-4o" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
] as const;

export type ProviderId = (typeof AVAILABLE_PROVIDERS)[number]["id"];
