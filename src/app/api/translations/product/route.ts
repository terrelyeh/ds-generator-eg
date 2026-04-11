import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/translations/product
 * Save product-level translations (overview + features).
 *
 * Body: {
 *   product_id: string (model_name),
 *   locale: string,
 *   translation_mode: "light" | "full",
 *   overview: string | null,
 *   features: string[] | null,
 *   confirm?: boolean,    // true = explicit Save (marks as confirmed)
 *                         // false/omitted = auto-save for Preview (keeps current confirmed status)
 * }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { product_id, locale, translation_mode, overview, features, headline, qr_label, qr_url, confirm } = body as {
    product_id: string;
    locale: string;
    translation_mode: "light" | "full";
    overview: string | null;
    features: string[] | null;
    headline?: string | null;
    qr_label?: string | null;
    qr_url?: string | null;
    confirm?: boolean;
  };

  if (!product_id || !locale) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const upsertData: Record<string, unknown> = {
    product_id,
    locale,
    translation_mode: translation_mode || "light",
    headline: headline?.trim() || null,
    overview: overview?.trim() || null,
    features: features ?? null,
    qr_label: qr_label?.trim() || null,
    qr_url: qr_url?.trim() || null,
    translated_at: new Date().toISOString(),
  };

  // Only set confirmed=true on explicit Save, never set it back to false
  if (confirm) {
    upsertData.confirmed = true;
  }

  const { error } = await supabase
    .from("product_translations" as "products")
    .upsert(upsertData, { onConflict: "product_id,locale" });

  if (error) {
    return NextResponse.json(
      { error: "Save failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, confirmed: !!confirm });
}

/**
 * DELETE /api/translations/product
 * Remove a product translation (disable a locale).
 * Body: { product_id: string, locale: string }
 */
export async function DELETE(request: Request) {
  const body = await request.json();
  const { product_id, locale } = body as { product_id: string; locale: string };

  if (!product_id || !locale) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("product_translations" as "products")
    .delete()
    .eq("product_id", product_id)
    .eq("locale", locale);

  if (error) {
    return NextResponse.json(
      { error: "Delete failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
