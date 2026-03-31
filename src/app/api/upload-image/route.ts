import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/upload-image
 *
 * Upload a product image (product or hardware) to Supabase Storage.
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

  // Verify product exists
  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("model_name", model)
    .single();

  if (!product) {
    return NextResponse.json(
      { error: `Product "${model}" not found` },
      { status: 404 }
    );
  }

  // Upload to Supabase Storage
  const ext = file.name.split(".").pop() || "png";
  const fileName = `${model}_${imageType}.${ext}`;
  const storagePath = `images/${model}/${fileName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

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

  // Update product record
  const field = imageType === "product" ? "product_image" : "hardware_image";
  await supabase
    .from("products")
    .update({ [field]: publicUrl })
    .eq("id", product.id);

  return NextResponse.json({
    ok: true,
    url: publicUrl,
    field,
  });
}
