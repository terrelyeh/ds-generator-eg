import { createAdminClient } from "@eg/db/admin";
import { basePrompt } from "./prompts/base";
import { jaLocalePrompt } from "./prompts/locales/ja";
import { zhTWLocalePrompt } from "./prompts/locales/zh-TW";
import { esLocalePrompt } from "./prompts/locales/es";
import { cloudCameraPrompt } from "./prompts/product-lines/cloud-camera";
import { contentTypePrompts } from "./prompts/content-types";
import { lineParityBudget } from "@/lib/datasheet/cover-layout";
import { resolveModel } from "@eg/llm/models";
import { createOpenRouterProvider } from "./providers/openrouter";

export { SUPPORTED_SURFACES } from "./types";
export type { TranslateModel, ModelSurface } from "./types";

// --- Model resolution ---

export interface ResolvedProvider {
  provider: ReturnType<typeof createOpenRouterProvider>;
  /** OpenRouter slug actually sent, for the audit trail. */
  model: string;
}

/**
 * Resolve a requested model against the DB catalog (llm_models).
 *
 * The direct-vendor clients that used to back this are gone. They existed
 * so deploying the OpenRouter migration before a key was configured
 * couldn't break translation — OpenRouter has since run real translations
 * in production, so keeping them meant carrying two extra keys and a
 * second code path for a case that can no longer happen.
 *
 * An unknown or just-disabled slug degrades to the catalog's translate
 * default rather than erroring: the picker's options can change between
 * a page load and a submit.
 */
async function resolveProvider(slug?: string, ref?: string): Promise<ResolvedProvider> {
  const model = await resolveModel(slug, "translate");
  if (!model) {
    throw new Error("No translation model is configured. Add one in Settings → AI Models.");
  }
  return {
    provider: createOpenRouterProvider(model.slug, model.label, model.slug, ref),
    model: model.slug,
  };
}

// --- Locale prompts ---

const localePrompts: Record<string, string> = {
  ja: jaLocalePrompt,
  "zh-TW": zhTWLocalePrompt,
  es: esLocalePrompt,
};

// --- Product line prompts ---

const productLinePrompts: Record<string, string> = {
  "Cloud Camera": cloudCameraPrompt,
  // Add more as needed:
  // "Cloud AP": cloudApPrompt,
  // "Cloud Switch": cloudSwitchPrompt,
};

// --- Layer 5: Load glossary from DB ---

async function loadGlossaryPrompt(
  targetLocale: string,
  productLine: string | undefined
): Promise<string> {
  try {
    const supabase = createAdminClient();

    // Fetch global terms + product-line-specific terms
    const scopes = ["global"];
    if (productLine) scopes.push(productLine);

    const { data } = await supabase
      .from("translation_glossary" as "products")
      .select("english_term, translated_term, scope")
      .eq("locale", targetLocale)
      .in("scope", scopes)
      .order("english_term") as {
      data: { english_term: string; translated_term: string; scope: string }[] | null;
    };

    if (!data || data.length === 0) return "";

    const lines = data.map((g) => `- "${g.english_term}" → ${g.translated_term}`);

    return `## Company Translation Glossary

The following terms MUST be translated exactly as specified. These are company-approved translations:

${lines.join("\n")}

IMPORTANT: Always use the glossary terms above. Do not use alternative translations for these terms.`;
  } catch {
    return "";
  }
}

// --- Layer 6: Per-item length budget computed from the source ---

/**
 * Turns the source text into an explicit character budget per item.
 *
 * "Do NOT make the text longer than necessary" in the base prompt is a
 * wish; this is a number. Spanish ECS1552FP is why it exists — translated
 * without a budget, three bullets each gained a wrapped line and pushed
 * the features box 5pt past its cap, which then collapsed the overview's
 * remaining space to 1pt of headroom.
 *
 * Applies to every locale, not just es. CJK overflows the same box for
 * the same reason, and the budget is computed from each locale's own
 * metrics (see lineParityBudget).
 */
function buildLengthBudgetPrompt(
  source: string,
  contentType: string,
  targetLocale: string
): string {
  if (contentType !== "features" && contentType !== "overview") return "";

  const texts =
    contentType === "features"
      ? source.split(/\n+/).map((l) => l.trim()).filter(Boolean)
      : [source];
  if (texts.length === 0) return "";

  const budgets = lineParityBudget({
    texts,
    block: contentType === "features" ? "features" : "overview",
    targetLocale,
  });

  const rows = budgets.map((b) =>
    contentType === "features"
      ? `- Line ${b.index}: max ${b.maxChars} characters (source wraps to ${b.sourceLines} line${b.sourceLines === 1 ? "" : "s"})`
      : `- Whole paragraph: max ${b.maxChars} characters (source wraps to ${b.sourceLines} lines)`
  );

  return `## Length Budget — HARD CONSTRAINT

The datasheet cover is a fixed-height layout. What breaks it is the number
of wrapped LINES, not the character count, so each item below has a budget
that keeps it on the same number of lines as the English source. One line
over on a single bullet is enough to overflow the two-column features box.

${rows.join("\n")}

Stay within every budget. If a faithful translation doesn't fit: drop
filler ("designed to", "allows you to"), choose the shorter synonym, or
cut a redundant qualifier. Losing a nuance is acceptable; going over is
not. Do NOT drop technical facts, model names, numbers or units to fit —
if only those remain, get as close to the budget as you can.`;
}

// --- Assemble system prompt from 6 layers ---

async function buildSystemPrompt(
  targetLocale: string,
  productLine: string | undefined,
  contentType: string,
  source: string
): Promise<string> {
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

  // Layer 5: glossary (from DB)
  const glossaryPrompt = await loadGlossaryPrompt(targetLocale, productLine);
  if (glossaryPrompt) {
    parts.push(glossaryPrompt);
  }

  // Layer 6: length budget. Last on purpose — it's the constraint most
  // likely to get dropped once the model is deep in terminology, so it
  // sits closest to the output.
  const budgetPrompt = buildLengthBudgetPrompt(source, contentType, targetLocale);
  if (budgetPrompt) {
    parts.push(budgetPrompt);
  }

  return parts.join("\n\n");
}

// --- Public API ---

/**
 * The assembled system prompt, without running a translation.
 *
 * Exists so the length budget can be inspected without spending an LLM
 * call or holding a key — the budget is the one layer computed from the
 * source at request time, so "is it actually in there" isn't answerable
 * by reading the prompt files.
 *
 * See scripts/check-translation-budget.ts --dry-run.
 */
export async function previewSystemPrompt(opts: {
  source: string;
  targetLocale: string;
  contentType: "headline" | "overview" | "features" | "spec_labels";
  productLine?: string;
}): Promise<string> {
  return buildSystemPrompt(
    opts.targetLocale,
    opts.productLine,
    opts.contentType,
    opts.source
  );
}

export async function translate(opts: {
  source: string;
  targetLocale: string;
  contentType: "headline" | "overview" | "features" | "spec_labels";
  productLine?: string;
  /** OpenRouter slug. Omit to use the catalog's translate default. */
  providerId?: string;
  /** Product model, for spend attribution. Falls back to the product line. */
  ref?: string;
}): Promise<{
  translated: string;
  notes: string;
  provider: string;
  /** OpenRouter slug actually sent. */
  model: string;
}> {
  const {
    source,
    targetLocale,
    contentType,
    productLine,
    providerId,
    ref,
  } = opts;

  const { provider, model } = await resolveProvider(providerId, ref ?? productLine);
  const systemPrompt = await buildSystemPrompt(
    targetLocale,
    productLine,
    contentType,
    source
  );

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
    // The response looked like JSON but wouldn't parse — usually truncated
    // mid-object when the model spends its budget on `notes`. Salvage the
    // translation rather than storing the JSON blob verbatim, which is how
    // an EOC610 headline ended up reading `{"translated": "…", "notes": "…`
    // on the datasheet cover.
    const salvaged = raw.match(/"translated"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (salvaged) {
      translated = salvaged[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .trim();
      notes = "";
    } else {
      // Genuinely not JSON — the model answered in plain text.
      translated = raw.trim();
      notes = "";
    }
  }

  return { translated, notes, provider: provider.name, model };
}
