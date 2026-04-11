import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/translations/spec-labels
 * Save spec label translations for a product line + locale.
 *
 * Body: {
 *   product_line_id: string,
 *   locale: string,
 *   translations: { original_label: string, translated_label: string, label_type: "spec" | "section" }[]
 * }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { product_line_id, locale, translations } = body as {
    product_line_id: string;
    locale: string;
    translations: {
      original_label: string;
      translated_label: string;
      label_type: "spec" | "section";
    }[];
  };

  if (!product_line_id || !locale || !translations) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Upsert each translation
  const rows = translations
    .filter((t) => t.translated_label && t.translated_label.trim().length > 0)
    .map((t) => ({
      product_line_id,
      locale,
      original_label: t.original_label,
      translated_label: t.translated_label.trim(),
      label_type: t.label_type,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, saved: 0 });
  }

  const { error } = await supabase
    .from("spec_label_translations" as "products")
    .upsert(rows, {
      onConflict: "product_line_id,locale,original_label,label_type",
    });

  if (error) {
    return NextResponse.json(
      { error: "Save failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, saved: rows.length });
}
