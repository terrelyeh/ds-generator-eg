import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectLocaleVersion } from "@/lib/google/drive-versions";
import type { ProductLine } from "@/types/database";

/**
 * GET /api/detect-locale-version?model=ECC100&lang=ja
 *
 * Checks Google Drive for existing locale-specific PDFs and syncs
 * the detected version to products.current_versions in DB.
 * Returns the detected version.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const model = searchParams.get("model");
  const lang = searchParams.get("lang");

  if (!model || !lang) {
    return NextResponse.json({ error: "Missing model or lang" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: product } = await supabase
    .from("products")
    .select("id, product_line_id, current_versions")
    .eq("model_name", model)
    .single();

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const { data: productLine } = (await supabase
    .from("product_lines")
    .select("drive_folder_id, ds_prefix")
    .eq("id", product.product_line_id)
    .single()) as { data: Pick<ProductLine, "drive_folder_id" | "ds_prefix"> | null };

  if (!productLine?.drive_folder_id) {
    return NextResponse.json({ ok: true, version: null });
  }

  try {
    const driveVersion = await detectLocaleVersion(
      productLine.drive_folder_id,
      productLine.ds_prefix ?? "DS_Cloud",
      model,
      lang
    );

    if (driveVersion) {
      // Sync to DB
      const currentVersions = (product.current_versions ?? {}) as Record<string, string>;
      if (!currentVersions[lang] || currentVersions[lang] === "0.0") {
        currentVersions[lang] = driveVersion.version;
        await supabase
          .from("products")
          .update({ current_versions: currentVersions })
          .eq("id", product.id);
      }

      return NextResponse.json({
        ok: true,
        version: driveVersion.version,
        folderId: driveVersion.folderId,
      });
    }

    return NextResponse.json({ ok: true, version: null });
  } catch (err) {
    return NextResponse.json({
      ok: true,
      version: null,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
