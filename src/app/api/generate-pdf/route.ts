import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  detectLatestVersion,
  bumpVersion,
  uploadPdfToDrive,
} from "@/lib/google/drive-versions";
import type { ProductLine } from "@/types/database";

// Chromium binary URL for @sparticuz/chromium-min (downloaded at runtime)
const CHROMIUM_URL =
  "https://github.com/nichochar/chromium-brotli/releases/download/v133.0.0/chromium-v133.0.0-pack.tar";

// Allow up to 60s for PDF generation
export const maxDuration = 60;

/**
 * POST /api/generate-pdf?model=ECC100
 *
 * 1. Detects latest version from Google Drive
 * 2. Generates PDF from the preview page using headless Chromium
 * 3. Uploads to Supabase Storage
 * 4. Uploads to Google Drive (in the model's folder)
 * 5. Bumps version in Supabase
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const model = searchParams.get("model");

  if (!model) {
    return NextResponse.json(
      { error: "Missing ?model= parameter" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Get the product + product line info
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, model_name, current_version, product_line_id")
    .eq("model_name", model)
    .single();

  if (productError || !product) {
    return NextResponse.json(
      { error: `Product "${model}" not found` },
      { status: 404 }
    );
  }

  const { data: productLine } = (await supabase
    .from("product_lines")
    .select("*")
    .eq("id", product.product_line_id)
    .single()) as { data: ProductLine | null };

  if (!productLine) {
    return NextResponse.json(
      { error: "Product line not found" },
      { status: 404 }
    );
  }

  try {
    // Step 1: Detect latest version from Google Drive
    let driveVersion = null;
    if (productLine.drive_folder_id) {
      try {
        driveVersion = await detectLatestVersion(
          productLine.drive_folder_id,
          productLine.ds_prefix ?? "DS_Cloud",
          model
        );
      } catch (err) {
        console.warn(
          "Drive version detection failed, using Supabase version:",
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    // Determine new version: Drive version takes priority, then Supabase
    const newVersion = driveVersion
      ? bumpVersion(driveVersion)
      : (() => {
          const currentVer = product.current_version || "1.0";
          const parts = currentVer.split(".");
          const major = parseInt(parts[0]) || 1;
          const minor = (parseInt(parts[1]) || 0) + 1;
          return `${major}.${minor}`;
        })();

    // Step 2: Generate PDF with headless Chromium
    const chromium = (await import("@sparticuz/chromium-min")).default;
    const puppeteer = (await import("puppeteer-core")).default;

    const executablePath = process.env.VERCEL
      ? await chromium.executablePath(CHROMIUM_URL)
      : process.platform === "darwin"
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : "/usr/bin/google-chrome";

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 612, height: 792 },
      executablePath,
      headless: true,
    });

    const page = await browser.newPage();

    const baseUrl =
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : `http://localhost:${process.env.PORT || 3000}`;

    await page.goto(`${baseUrl}/preview/${model}`, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    const pdfBuffer = Buffer.from(
      await page.pdf({
        format: "Letter",
        printBackground: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      })
    );

    await browser.close();

    // Step 3: Upload to Supabase Storage
    const dsPrefix = productLine.ds_prefix ?? "DS_Cloud";
    const fileName = `${dsPrefix}_${model}_v${newVersion}.pdf`;
    const storagePath = `${model}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("datasheets")
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: "PDF upload to Supabase failed", details: uploadError.message },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage
      .from("datasheets")
      .getPublicUrl(storagePath);

    const pdfUrl = urlData.publicUrl;

    // Step 4: Upload to Google Drive
    let driveResult = null;
    if (productLine.drive_folder_id) {
      try {
        driveResult = await uploadPdfToDrive(
          productLine.drive_folder_id,
          dsPrefix,
          model,
          newVersion,
          pdfBuffer,
          driveVersion
        );
      } catch (err) {
        console.error(
          "Drive upload failed (PDF still saved to Supabase):",
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    // Step 5: Update Supabase records
    await supabase.from("versions").insert({
      product_id: product.id,
      version: newVersion,
      changes: `PDF generated${driveVersion ? ` (base: v${driveVersion.version})` : " (initial)"}`,
      pdf_storage_path: pdfUrl,
    });

    await supabase
      .from("products")
      .update({ current_version: newVersion })
      .eq("id", product.id);

    await supabase.from("change_logs").insert({
      product_id: product.id,
      product_line_id: product.product_line_id,
      changes_summary: `Generated PDF v${newVersion}`,
    });

    return NextResponse.json({
      ok: true,
      model,
      version: newVersion,
      baseVersion: driveVersion?.version ?? null,
      fileName,
      pdfUrl,
      driveFileId: driveResult?.fileId ?? null,
      driveLink: driveResult?.webViewLink ?? null,
    });
  } catch (err) {
    console.error("PDF generation error:", err);
    return NextResponse.json(
      {
        error: "PDF generation failed",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
