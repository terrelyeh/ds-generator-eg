import { NextResponse } from "next/server";
import { translate } from "@/lib/translate";
import { lineParityCheck } from "@/lib/datasheet/cover-layout";
import { getModel } from "@eg/llm/models";
import { gateWithRateLimit } from "@eg/auth/session";

export const maxDuration = 30;

/**
 * POST /api/translate
 *
 * Body: {
 *   source: string,           // Text to translate
 *   target_locale: string,    // "ja" | "zh-TW"
 *   content_type: "headline" | "overview" | "features" | "spec_labels",
 *   product_line?: string,    // e.g. "Cloud Camera"
 *   provider?: string,        // OpenRouter slug; omit for the catalog default
 * }
 *
 * Returns: { ok: true, translated: string, provider: string }
 */
export async function POST(request: Request) {
  const denied = await gateWithRateLimit("translation.edit", { key: "translate", max: 30, windowSeconds: 60 });
  if (denied) return denied;
  const body = await request.json();
  const {
    source,
    target_locale,
    content_type,
    product_line,
    provider,
    ref,
  } = body as {
    source: string;
    target_locale: string;
    content_type: "headline" | "overview" | "features" | "spec_labels";
    product_line?: string;
    provider?: string;
    ref?: string;
  };

  if (!source || !target_locale || !content_type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Validate against the catalog rather than a hardcoded list. An unknown
  // slug is rejected here instead of silently falling back, so a typo in a
  // caller shows up as an error rather than the wrong model quietly running.
  if (provider) {
    const known = await getModel(provider);
    if (!known) {
      return NextResponse.json(
        { error: `Unknown model: ${provider}. Check Settings → AI Models.` },
        { status: 400 },
      );
    }
  }

  const run = () =>
    translate({
      source,
      targetLocale: target_locale,
      contentType: content_type,
      productLine: product_line,
      providerId: provider,
      // Every translation button in the app arrives here — cover copy, spec
      // labels and review comments alike — so they share one usage tag.
      feature: "translate",
      ref,
    });

  try {
    let result = await run();

    /**
     * A translated feature list has to have exactly as many lines as the
     * English one, because the two are matched BY INDEX — the editor draws
     * `englishFeatures.map((_, i) => lines[i])` and the datasheet prints the
     * pairs. A model that merges two bullets into one does not lose a
     * bullet; it shifts every bullet after it onto the wrong English line
     * and leaves the last one blank. Nothing downstream can detect that:
     * the count is padded back to the right length on save, so the stored
     * list looks well-formed and prints wrong.
     *
     * Sampling is at 0.3, so simply asking again usually produces a
     * correctly split list. If it does not, the caller is told and the form
     * is left alone — a shifted list quietly filled into the editor is the
     * one outcome worth avoiding.
     */
    let lineMismatch: { expected: number; got: number } | undefined;
    if (content_type === "features") {
      const countLines = (t: string) => t.split("\n").filter((l) => l.trim()).length;
      const expected = countLines(source);
      if (countLines(result.translated) !== expected) {
        result = await run();
        const got = countLines(result.translated);
        if (got !== expected) lineMismatch = { expected, got };
      }
    }

    /**
     * The length budget (prompt layer 6) is a number the model is asked to
     * respect; until now nothing measured what came back, so it was a wish.
     * Same ruler as the budget — `lineParityCheck` uses the metrics the
     * budget was built from — so the two cannot disagree. One retry; then
     * the caller is told which items cost a line, and fills them anyway:
     * a long translation is fixable by hand, unlike a shifted list.
     */
    let overBudget: { index: number; sourceLines: number; gotLines: number }[] | undefined;
    if (content_type === "features" || content_type === "overview") {
      const split = (t: string) =>
        content_type === "features"
          ? t.split("\n").map((l) => l.trim()).filter(Boolean)
          : [t];
      const over = () =>
        lineParityCheck({
          texts: split(source),
          translated: split(result.translated),
          block: content_type,
          targetLocale: target_locale,
        }).filter((c) => c.over);
      let bad = over();
      // A list of the wrong length has already had its retry; measuring it
      // item by item would compare the wrong pairs.
      if (bad.length > 0 && !lineMismatch) {
        result = await run();
        bad = over();
      }
      if (bad.length > 0) {
        overBudget = bad.map(({ index, sourceLines, gotLines }) => ({ index, sourceLines, gotLines }));
      }
    }

    return NextResponse.json({
      ok: true,
      translated: result.translated,
      notes: result.notes,
      provider: result.provider,
      /** Present only when the feature list came back the wrong length. */
      line_mismatch: lineMismatch,
      /** Items that wrap to more lines than their English source. */
      over_budget: overBudget,
      // Exact model + transport, so the caller can record what produced
      // this text. product_translations.translated_by had no writer at
      // all before, which is why existing rows can't be traced.
      model: result.model,
    });
  } catch (err) {
    console.error("Translation error:", err);
    return NextResponse.json(
      {
        error: "Translation failed",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
