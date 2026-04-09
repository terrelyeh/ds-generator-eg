import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadImageToDrive } from "@/lib/google/drive-images";

/**
 * POST /api/upload-image
 *
 * Upload a product image (product or hardware) to Supabase Storage + Google Drive.
 * Expects multipart form data with:
 *   - file: the image file
 *   - model: model name (e.g. "ECC100")
 *   - type: "product" or "hardware"
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const model = formData.get("model") as string | null;
  const imageType = formData.get("type") as string | null;

  if (!file || !model || !imageType) {
    return NextResponse.json(
      { error: "Missing file, model, or type" },
      { status: 400 }
    );
  }

  if (!["product", "hardware"].includes(imageType)) {
    return NextResponse.json(
      { error: "type must be 'product' or 'hardware'" },
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
    .select("ds_images_folder_id")
    .eq("id", product.product_line_id)
    .single();

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop() || "png";
  const fileName = `${model}_${imageType}.${ext}`;
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

  // 2. Update product record
  const field = imageType === "product" ? "product_image" : "hardware_image";
  await supabase
    .from("products")
    .update({ [field]: publicUrl })
    .eq("id", product.id);

  // 3. Upload to Google Drive DS Images folder (async, non-blocking)
  let driveFileId: string | null = null;
  const dsFolderId = productLine?.ds_images_folder_id;
  if (dsFolderId) {
    try {
      driveFileId = await uploadImageToDrive(
        dsFolderId,
        fileName,
        buffer,
        file.type
      );
    } catch (err) {
      console.error(
        `Drive upload failed for ${fileName}:`,
        err instanceof Error ? err.message : String(err)
      );
      // Don't fail the request — Supabase upload succeeded
    }
  }

  return NextResponse.json({
    ok: true,
    url: publicUrl,
    field,
    driveFileId,
    driveUploaded: !!driveFileId,
  });
}
