import { NextResponse } from "next/server";
import { translate } from "@/lib/translate";
import { getModel } from "@eg/llm/models";
import { gate } from "@eg/auth/session";

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
  const denied = await gate("translation.edit");
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

  try {
    const result = await translate({
      source,
      targetLocale: target_locale,
      contentType: content_type,
      productLine: product_line,
      providerId: provider,
      ref,
    });

    return NextResponse.json({
      ok: true,
      translated: result.translated,
      notes: result.notes,
      provider: result.provider,
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
