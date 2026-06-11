import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncLocalizedHardwareImage, syncProductImages } from "@/lib/google/drive-images";
import { gate } from "@/lib/auth/session";

/**
 * POST /api/resync-product?model=ECC500Z
 *
 * Triggers an immediate image-only resync for a single product: walks the
 * English DS Images folder AND every enabled locale's DS Images folder,
 * updates the products / product_translations rows, and propagates
 * deletes (file missing in Drive → DB field cleared).
 *
 * Does NOT re-read Google Sheets or touch spec data — use /api/sync for that.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const denied = await gate("sync.run");
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const model = searchParams.get("model");
  if (!model) {
    return NextResponse.json({ error: "Missing ?model=" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, model_name, product_image, hardware_image, current_versions, product_line_id")
    .eq("model_name", model)
    .single();

  if (productError || !product) {
    return NextResponse.json(
      { error: `Product "${model}" not found` },
      { status: 404 },
    );
  }

  const { data: line } = await supabase
    .from("product_lines")
    .select("name, ds_images_folder_id")
    .eq("id", product.product_line_id)
    .single();

  if (!line?.ds_images_folder_id) {
    return NextResponse.json(
      { error: "Product line has no ds_images_folder_id configured" },
      { status: 400 },
    );
  }

  // English sync (handles product + hardware + delete propagation)
  const imgResult = await syncProductImages(model, supabase, line.ds_images_folder_id, {
    existingImages: {
      product_image: product.product_image || undefined,
      hardware_image: product.hardware_image || undefined,
    },
  });

  const imageUpdate: Record<string, string | null> = {};
  if (imgResult.product_image_url) {
    imageUpdate.product_image = imgResult.product_image_url;
  } else if (imgResult.folder_listed && product.product_image) {
    imageUpdate.product_image = null;
  }
  if (imgResult.hardware_image_url) {
    imageUpdate.hardware_image = imgResult.hardware_image_url;
  } else if (imgResult.folder_listed && product.hardware_image) {
    imageUpdate.hardware_image = null;
  }
  if (Object.keys(imageUpdate).length > 0) {
    await supabase.from("products").update(imageUpdate).eq("id", product.id);
  }

  // Per-locale hardware sync (updates product_translations.hardware_image
  // and clears it when the Drive file is gone)
  const enabledLocales = Object.keys(
    (product.current_versions as Record<string, string> | null) ?? {},
  ).filter((l) => l && l !== "en");

  const localeResults: Record<string, { url: string | null; folder_listed: boolean }> = {};
  for (const locale of enabledLocales) {
    try {
      const res = await syncLocalizedHardwareImage({
        modelName: model,
        productId: product.id,
        locale,
        lineName: line.name,
        enDsImagesFolderId: line.ds_images_folder_id,
        supabase,
      });
      localeResults[locale] = res;
    } catch (err) {
      console.error(`resync ${locale} failed:`, err);
      localeResults[locale] = { url: null, folder_listed: false };
    }
  }

  return NextResponse.json({
    ok: true,
    model,
    english: {
      product_image: imageUpdate.product_image !== undefined ? imageUpdate.product_image : product.product_image,
      hardware_image: imageUpdate.hardware_image !== undefined ? imageUpdate.hardware_image : product.hardware_image,
      folder_listed: imgResult.folder_listed,
      cleared: Object.entries(imageUpdate)
        .filter(([, v]) => v === null)
        .map(([k]) => k),
    },
    locales: localeResults,
  });
}
