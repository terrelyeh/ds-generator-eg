import { NextResponse } from "next/server";
import { translate, AVAILABLE_PROVIDERS } from "@/lib/translate";
import type { ProviderId } from "@/lib/translate";

export const maxDuration = 30;

/**
 * POST /api/translate
 *
 * Body: {
 *   source: string,           // Text to translate
 *   target_locale: string,    // "ja" | "zh-TW"
 *   content_type: "headline" | "overview" | "features" | "spec_labels",
 *   product_line?: string,    // e.g. "Cloud Camera"
 *   provider?: string,        // e.g. "claude-sonnet"
 * }
 *
 * Returns: { ok: true, translated: string, provider: string }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const {
    source,
    target_locale,
    content_type,
    product_line,
    provider = "claude-sonnet",
  } = body as {
    source: string;
    target_locale: string;
    content_type: "headline" | "overview" | "features" | "spec_labels";
    product_line?: string;
    provider?: string;
  };

  if (!source || !target_locale || !content_type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Validate provider
  const validProviders = AVAILABLE_PROVIDERS.map((p) => p.id);
  if (!validProviders.includes(provider as ProviderId)) {
    return NextResponse.json(
      { error: `Invalid provider. Available: ${validProviders.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const result = await translate({
      source,
      targetLocale: target_locale,
      contentType: content_type,
      productLine: product_line,
      providerId: provider as ProviderId,
    });

    return NextResponse.json({
      ok: true,
      translated: result.translated,
      notes: result.notes,
      provider: result.provider,
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
