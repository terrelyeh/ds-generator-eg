import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate } from "@eg/auth/session";

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
  const denied = await gate("translation.edit");
  if (denied) return denied;
  const body = await request.json();
  const { product_id, locale, translation_mode, overview, features, headline, subtitle, hardware_image, qr_label, qr_url, translated_by, confirm } = body as {
    product_id: string;
    locale: string;
    translation_mode: "light" | "full";
    overview: string | null;
    features: string[] | null;
    headline?: string | null;
    subtitle?: string | null;
    hardware_image?: string | null;
    qr_label?: string | null;
    qr_url?: string | null;
    translated_by?: string | null;
    confirm?: boolean;
  };

  if (!product_id || !locale) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // A translated feature list must be exactly as long as the English one it
  // renders against. When a feature is deleted from the sheet the stored
  // translation keeps its old length, and the editor only draws
  // englishFeatures.length rows — so the extra tail is invisible there and
  // gets posted straight back, then prints on the datasheet. ECP106 zh-TW
  // shipped two orphaned bullets that way (2026-08-03). Trim here too, so
  // the invariant doesn't depend on the client that happens to be calling.
  let alignedFeatures = features ?? null;
  if (alignedFeatures) {
    const { data: product } = (await supabase
      .from("products")
      .select("features")
      .eq("model_name", product_id)
      .single()) as { data: { features: string[] | null } | null };
    const sourceLength = product?.features?.length;
    if (sourceLength !== undefined && alignedFeatures.length !== sourceLength) {
      console.warn(
        `[translations] ${product_id}/${locale}: ${alignedFeatures.length} translated features vs ${sourceLength} source — aligning.`,
      );
      alignedFeatures = Array.from({ length: sourceLength }, (_, i) => alignedFeatures![i] ?? "");
    }
  }

  const upsertData: Record<string, unknown> = {
    product_id,
    locale,
    translation_mode: translation_mode || "light",
    headline: headline?.trim() || null,
    subtitle: subtitle?.trim() || null,
    overview: overview?.trim() || null,
    features: alignedFeatures,
    hardware_image: hardware_image?.trim() || null,
    qr_label: qr_label?.trim() || null,
    qr_url: qr_url?.trim() || null,
    translated_at: new Date().toISOString(),
  };

  // Only stamp when the client actually ran a translation this session —
  // a hand-edit shouldn't relabel the row as machine-produced, and an
  // absent value shouldn't wipe what an earlier run recorded.
  if (translated_by) {
    upsertData.translated_by = translated_by;
  }

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
