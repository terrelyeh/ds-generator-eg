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

/**
 * Surfaces a model can be offered on. Lives here because both the catalog
 * API and the pickers validate against it.
 */
export const SUPPORTED_SURFACES = ["translate", "ask"] as const;
export type ModelSurface = (typeof SUPPORTED_SURFACES)[number];

/**
 * A model as the picker sees it. The catalog is in the DB now
 * (llm_models, migration 00035) — AVAILABLE_PROVIDERS was a hardcoded
 * list whose ids had drifted from what they invoked, which is exactly
 * what keying on the slug fixes.
 */
export interface TranslateModel {
  slug: string;
  label: string;
  reasoning_effort: "none" | "minimal" | "low" | "medium" | "high" | null;
}

