import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteDriveFilesByPrefix,
  resolveLocaleDsImagesFolder,
  uploadImageToDrive,
} from "@/lib/google/drive-images";
import { getLocaleSuffix } from "@/lib/google/drive-versions";

/**
 * POST /api/upload-image
 *
 * Upload a product image to Supabase Storage + Google Drive.
 * Expects multipart form data with:
 *   - file: the image file
 *   - model: model name (e.g. "ECC100")
 *   - type: "product" | "hardware" | "radio_pattern"
 *   - label: (radio_pattern only) e.g. "2.4G H-plane"
 *   - locale: (optional) translation locale e.g. "zh-TW", "ja". When set and
 *     non-English, the file is stored under a locale-suffixed filename
 *     (ECC100_hardware_zh.png) and products.hardware_image is NOT touched —
 *     the caller is expected to save the returned URL into
 *     product_translations.hardware_image via the translations API.
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const model = formData.get("model") as string | null;
  const imageType = formData.get("type") as string | null;
  const label = formData.get("label") as string | null;
  const localeRaw = formData.get("locale") as string | null;
  // Treat empty string / "en" as "no locale" so the English path is
  // unchanged. Any other value is considered a localized upload.
  const locale = localeRaw && localeRaw !== "en" ? localeRaw : null;
  const localeSuffix = locale ? `_${getLocaleSuffix(locale)}` : "";

  if (!file || !model || !imageType) {
    return NextResponse.json(
      { error: "Missing file, model, or type" },
      { status: 400 }
    );
  }

  if (!["product", "hardware", "radio_pattern"].includes(imageType)) {
    return NextResponse.json(
      { error: "type must be 'product', 'hardware', or 'radio_pattern'" },
      { status: 400 }
    );
  }

  if (imageType === "radio_pattern" && !label) {
    return NextResponse.json(
      { error: "label is required for radio_pattern (e.g. '2.4G H-plane')" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Verify product exists and get its product line's DS Images folder
  const { data: product } = await supabase
    .from("products")
    .select("id, product_line_id")
    .eq("model_name", model)
    .single();

  if (!product) {
    return NextResponse.json(
      { error: `Product "${model}" not found` },
      { status: 404 }
    );
  }

  const { data: productLine } = await supabase
    .from("product_lines")
    .select("ds_images_folder_id, name")
    .eq("id", product.product_line_id)
    .single();

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop() || "png";

  // Build file name based on type and optional locale suffix.
  // English (no locale):
  //   product        → ECW526_product.png
  //   hardware       → ECW526_hardware.png
  //   radio_pattern  → ECW526_2.4G_H-plane.png
  // Localized (locale=zh-TW → _zh):
  //   hardware       → ECW526_hardware_zh.png
  let fileName: string;
  if (imageType === "radio_pattern" && label) {
    // label format: "2.4G H-plane" → "2.4G_H-plane"
    const labelSlug = label.replace(/\s+/g, "_");
    fileName = `${model}_${labelSlug}${localeSuffix}.${ext}`;
  } else {
    fileName = `${model}_${imageType}${localeSuffix}.${ext}`;
  }

  const storagePath = `images/${model}/${fileName}`;

  // 1. Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from("datasheets")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: "Upload failed", details: uploadError.message },
      { status: 500 }
    );
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from("datasheets")
    .getPublicUrl(storagePath);

  const publicUrl = urlData.publicUrl;

  // 2. Update records.
  //
  // For English uploads, write the URL into products.product_image /
  // products.hardware_image (the canonical English fields).
  //
  // For localized uploads (locale set), DO NOT touch the products row — the
  // caller (translation editor) will save the returned URL into
  // product_translations.hardware_image via /api/translations/product.
  // Writing to products here would silently overwrite the English URL
  // whenever a translator uploads a locale-specific hardware image.
  if (!locale && (imageType === "product" || imageType === "hardware")) {
    const field = imageType === "product" ? "product_image" : "hardware_image";
    await supabase
      .from("products")
      .update({ [field]: publicUrl })
      .eq("id", product.id);
  } else if (imageType === "radio_pattern" && label) {
    // Upsert image_assets record
    const { data: existing } = await supabase
      .from("image_assets")
      .select("id")
      .eq("product_id", product.id)
      .eq("image_type", "radio_pattern")
      .eq("label", label)
      .single();

    if (existing) {
      await supabase
        .from("image_assets")
        .update({ file_url: publicUrl, status: "uploaded" })
        .eq("id", existing.id);
    } else {
      await supabase.from("image_assets").insert({
        product_id: product.id,
        image_type: "radio_pattern",
        label,
        file_url: publicUrl,
        status: "uploaded",
      });
    }
  }

  // 3. Upload to Google Drive DS Images folder (non-blocking).
  //
  // For localized uploads, resolve the <lineName>_<locale>/DS Images/
  // sibling folder via resolveLocaleDsImagesFolder — auto-creates the
  // DS Images subfolder if it doesn't exist yet. For English, use the
  // product line's ds_images_folder_id directly.
  let driveFileId: string | null = null;
  const enDsFolderId = productLine?.ds_images_folder_id;
  const lineName = productLine?.name;
  if (enDsFolderId) {
    try {
      const targetFolderId = locale && lineName
        ? await resolveLocaleDsImagesFolder({
            enDsImagesFolderId: enDsFolderId,
            lineName,
            locale,
          })
        : enDsFolderId;
      driveFileId = await uploadImageToDrive(
        targetFolderId,
        fileName,
        buffer,
        file.type
      );
    } catch (err) {
      console.error(
        `Drive upload failed for ${fileName}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return NextResponse.json({
    ok: true,
    url: publicUrl,
    fileName,
    driveFileId,
    driveUploaded: !!driveFileId,
  });
}

/**
 * DELETE /api/upload-image?model=ECC500Z&type=hardware[&locale=zh-TW][&label=2.4G_H-plane]
 *
 * Deletes a product image across all stores:
 *   - Supabase Storage file (images/<model>/<filename>)
 *   - Matching Drive file (trashed, recoverable for 30 days)
 *   - DB field: products.product_image / products.hardware_image (EN) or
 *     product_translations.hardware_image (localized)
 *
 * For radio_pattern, also removes the corresponding image_assets row.
 */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const model = searchParams.get("model");
  const imageType = searchParams.get("type");
  const label = searchParams.get("label");
  const localeRaw = searchParams.get("locale");
  const locale = localeRaw && localeRaw !== "en" ? localeRaw : null;
  const localeSuffix = locale ? `_${getLocaleSuffix(locale)}` : "";

  if (!model || !imageType) {
    return NextResponse.json(
      { error: "Missing ?model= or ?type=" },
      { status: 400 },
    );
  }
  if (!["product", "hardware", "radio_pattern"].includes(imageType)) {
    return NextResponse.json(
      { error: "type must be 'product', 'hardware', or 'radio_pattern'" },
      { status: 400 },
    );
  }
  if (imageType === "radio_pattern" && !label) {
    return NextResponse.json(
      { error: "label is required for radio_pattern" },
      { status: 400 },
    );
  }
  // product and radio_pattern are shared across locales — refuse locale
  // delete for those types (only hardware has per-locale variants).
  if (locale && imageType !== "hardware") {
    return NextResponse.json(
      { error: "Only hardware supports locale-specific deletion" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data: product } = await supabase
    .from("products")
    .select("id, product_line_id")
    .eq("model_name", model)
    .single();

  if (!product) {
    return NextResponse.json(
      { error: `Product "${model}" not found` },
      { status: 404 },
    );
  }

  const { data: productLine } = await supabase
    .from("product_lines")
    .select("ds_images_folder_id, name")
    .eq("id", product.product_line_id)
    .single();

  // Compute the filename prefix we'll use for Drive + Storage lookups.
  // For product/hardware: "<model>_<type>[_<locale>]"
  // For radio_pattern:    "<model>_<labelSlug>"
  let filePrefix: string;
  if (imageType === "radio_pattern" && label) {
    const labelSlug = label.replace(/\s+/g, "_");
    filePrefix = `${model}_${labelSlug}`;
  } else {
    filePrefix = `${model}_${imageType}${localeSuffix}`;
  }

  // 1. Delete all matching files in Supabase Storage under images/<model>/
  const { data: storageList } = await supabase.storage
    .from("datasheets")
    .list(`images/${model}`);

  const storagePathsToDelete = (storageList ?? [])
    .filter((f) => f.name.toLowerCase().startsWith(filePrefix.toLowerCase() + "."))
    .map((f) => `images/${model}/${f.name}`);

  if (storagePathsToDelete.length > 0) {
    const { error: deleteErr } = await supabase.storage
      .from("datasheets")
      .remove(storagePathsToDelete);
    if (deleteErr) {
      console.error(`Supabase Storage delete failed:`, deleteErr.message);
    }
  }

  // 2. Delete from Drive (trashed — recoverable)
  let driveTrashed = 0;
  const enDsFolderId = productLine?.ds_images_folder_id;
  if (enDsFolderId) {
    try {
      const targetFolderId = locale && productLine?.name
        ? await resolveLocaleDsImagesFolder({
            enDsImagesFolderId: enDsFolderId,
            lineName: productLine.name,
            locale,
          })
        : enDsFolderId;
      driveTrashed = await deleteDriveFilesByPrefix(targetFolderId, filePrefix);
    } catch (err) {
      console.error(
        `Drive delete failed for ${filePrefix}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // 3. Clear DB field
  if (imageType === "product") {
    await supabase
      .from("products")
      .update({ product_image: null })
      .eq("id", product.id);
  } else if (imageType === "hardware") {
    if (locale) {
      // Clear product_translations.hardware_image for this locale only
      await supabase
        .from("product_translations" as "products")
        .update({ hardware_image: null })
        .eq("product_id", product.id)
        .eq("locale", locale);
    } else {
      await supabase
        .from("products")
        .update({ hardware_image: null })
        .eq("id", product.id);
    }
  } else if (imageType === "radio_pattern" && label) {
    await supabase
      .from("image_assets")
      .delete()
      .eq("product_id", product.id)
      .eq("image_type", "radio_pattern")
      .eq("label", label);
  }

  return NextResponse.json({
    ok: true,
    model,
    type: imageType,
    locale,
    label,
    storageDeleted: storagePathsToDelete.length,
    driveTrashed,
  });
}
