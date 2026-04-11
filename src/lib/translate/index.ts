import { claudeSonnet, claudeOpus } from "./providers/claude";
import { gpt4o } from "./providers/openai";
import { gemini25Pro } from "./providers/gemini";
import { basePrompt } from "./prompts/base";
import { jaLocalePrompt } from "./prompts/locales/ja";
import { zhTWLocalePrompt } from "./prompts/locales/zh-TW";
import { cloudCameraPrompt } from "./prompts/product-lines/cloud-camera";
import { contentTypePrompts } from "./prompts/content-types";
import type { TranslateProvider, ProviderId } from "./types";

export { AVAILABLE_PROVIDERS } from "./types";
export type { ProviderId };

// --- Provider registry ---

const providers: Record<string, TranslateProvider> = {
  "claude-sonnet": claudeSonnet,
  "claude-opus": claudeOpus,
  "gpt-4o": gpt4o,
  "gemini-2.5-pro": gemini25Pro,
};

function getProvider(id: string): TranslateProvider {
  const p = providers[id];
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

// --- Locale prompts ---

const localePrompts: Record<string, string> = {
  ja: jaLocalePrompt,
  "zh-TW": zhTWLocalePrompt,
};

// --- Product line prompts ---

const productLinePrompts: Record<string, string> = {
  "Cloud Camera": cloudCameraPrompt,
  // Add more as needed:
  // "Cloud AP": cloudApPrompt,
  // "Cloud Switch": cloudSwitchPrompt,
};

// --- Assemble system prompt from 4 layers ---

function buildSystemPrompt(
  targetLocale: string,
  productLine: string | undefined,
  contentType: string
): string {
  const parts = [basePrompt];

  // Layer 2: locale
  if (localePrompts[targetLocale]) {
    parts.push(localePrompts[targetLocale]);
  }

  // Layer 3: product line
  if (productLine && productLinePrompts[productLine]) {
    parts.push(productLinePrompts[productLine]);
  }

  // Layer 4: content type
  if (contentTypePrompts[contentType]) {
    parts.push(contentTypePrompts[contentType]);
  }

  return parts.join("\n\n");
}

// --- Public API ---

export async function translate(opts: {
  source: string;
  targetLocale: string;
  contentType: "overview" | "features" | "spec_labels";
  productLine?: string;
  providerId?: ProviderId;
}): Promise<{ translated: string; notes: string; provider: string }> {
  const {
    source,
    targetLocale,
    contentType,
    productLine,
    providerId = "claude-sonnet",
  } = opts;

  const provider = getProvider(providerId);
  const systemPrompt = buildSystemPrompt(targetLocale, productLine, contentType);

  const userMessage = `Translate the following to ${targetLocale}:\n\n${source}`;

  const raw = await provider.translate(systemPrompt, userMessage);

  // Parse JSON response
  let translated: string;
  let notes = "";

  try {
    // Try to extract JSON from response (handle potential markdown code fences)
    const jsonStr = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(jsonStr);
    translated = parsed.translated ?? "";
    notes = parsed.notes ?? "";
  } catch {
    // Fallback: if AI didn't return valid JSON, use raw text as translation
    translated = raw.trim();
    notes = "";
  }

  return { translated, notes, provider: provider.name };
}
