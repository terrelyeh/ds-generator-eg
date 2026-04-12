import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  detectLatestVersion,
  detectLocaleVersion,
  bumpVersion,
  uploadPdfToDrive,
  getLocaleSuffix,
} from "@/lib/google/drive-versions";
import type { ProductLine } from "@/types/database";

// Chromium binary URL for @sparticuz/chromium-min (downloaded at runtime)
const CHROMIUM_URL =
  "https://github.com/nichochar/chromium-brotli/releases/download/v133.0.0/chromium-v133.0.0-pack.tar";

// Allow up to 60s for PDF generation
export const maxDuration = 60;

// PDF generation lock: auto-expires after 5 minutes
const LOCK_TTL_MS = 5 * 60 * 1000;

interface PdfLock {
  locked_at: string;
  model: string;
  lang: string;
}

function getLockKey(model: string, lang: string) {
  return `pdf_lock_${model}_${lang}`;
}

/**
 * GET /api/generate-pdf?model=ECC100&lang=en
 * Check if a PDF generation lock is active for a model+locale.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const model = searchParams.get("model");
  const lang = searchParams.get("lang") ?? "en";

  if (!model) {
    return NextResponse.json({ error: "Missing ?model=" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const lockKey = getLockKey(model, lang);

  const { data } = await supabase
    .from("app_settings" as "products")
    .select("value")
    .eq("key", lockKey)
    .single() as { data: { value: string } | null };

  if (data?.value) {
    try {
      const lock: PdfLock = JSON.parse(data.value);
      const elapsed = Date.now() - new Date(lock.locked_at).getTime();
      if (elapsed < LOCK_TTL_MS) {
        return NextResponse.json({ ok: true, locked: true, lock });
      }
    } catch { /* expired or bad data */ }
  }

  return NextResponse.json({ ok: true, locked: false });
}

/**
 * POST /api/generate-pdf?model=ECC100&mode=regenerate&lang=en
 *
 * 1. Acquires generation lock (prevents concurrent generation for same model+locale)
 * 2. Detects latest version from Google Drive (locale-aware)
 * 3. Generates PDF from the preview page using headless Chromium
 * 4. Uploads to Supabase Storage
 * 5. Uploads to Google Drive (locale-specific folder)
 * 6. Bumps version in Supabase (with optimistic locking)
 * 7. Releases lock
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const model = searchParams.get("model");
  const mode = searchParams.get("mode") ?? "regenerate"; // "regenerate" | "new"
  const lang = searchParams.get("lang") ?? "en";

  if (!model) {
    return NextResponse.json(
      { error: "Missing ?model= parameter" },
      { status: 400 }
    );
  }

  const isLocalized = lang !== "en";
  const supabase = createAdminClient();
  const lockKey = getLockKey(model, lang);

  // --- Acquire lock ---
  const { data: existingLock } = await supabase
    .from("app_settings" as "products")
    .select("value")
    .eq("key", lockKey)
    .single() as { data: { value: string } | null };

  if (existingLock?.value) {
    try {
      const lock: PdfLock = JSON.parse(existingLock.value);
      const elapsed = Date.now() - new Date(lock.locked_at).getTime();
      if (elapsed < LOCK_TTL_MS) {
        return NextResponse.json(
          { error: `PDF is already being generated for ${model} (${lang}). Please wait and try again.` },
          { status: 409 }
        );
      }
    } catch { /* stale lock, proceed to overwrite */ }
  }

  const lockValue: PdfLock = { locked_at: new Date().toISOString(), model, lang };
  await supabase
    .from("app_settings" as "products")
    .upsert(
      { key: lockKey, value: JSON.stringify(lockValue), updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );

  // Get the product + product line info
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, model_name, current_version, current_versions, product_line_id")
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

  // Helper to release the lock
  async function releaseLock() {
    await supabase
      .from("app_settings" as "products")
      .delete()
      .eq("key", lockKey);
  }

  try {
    const dsPrefix = productLine.ds_prefix ?? "DS_Cloud";
    const currentVersions = (product.current_versions ?? {}) as Record<string, string>;

    // Step 1: Determine version
    let newVersion: string;

    if (isLocalized) {
      // Locale versions — check Drive first, then DB fallback
      let driveLocaleVersion = null;
      if (productLine.drive_folder_id) {
        try {
          driveLocaleVersion = await detectLocaleVersion(
            productLine.drive_folder_id,
            dsPrefix,
            model,
            lang
          );
        } catch (err) {
          console.warn(
            "Drive locale version detection failed:",
            err instanceof Error ? err.message : String(err)
          );
        }
      }

      const currentLocaleVer = driveLocaleVersion?.version || currentVersions[lang] || "0.0";
      const isRegenerate = mode === "regenerate";
      const hasExistingVersion = currentLocaleVer !== "0.0";

      if (isRegenerate && hasExistingVersion) {
        newVersion = currentLocaleVer;
      } else {
        newVersion = driveLocaleVersion
          ? bumpVersion(driveLocaleVersion)
          : (() => {
              if (currentLocaleVer === "0.0") return "1.0";
              const parts = currentLocaleVer.split(".");
              const major = parseInt(parts[0]) || 1;
              const minor = (parseInt(parts[1]) || 0) + 1;
              return `${major}.${minor}`;
            })();
      }
    } else {
      // English version — existing logic with Drive detection
      let driveVersion = null;
      if (productLine.drive_folder_id) {
        try {
          driveVersion = await detectLatestVersion(
            productLine.drive_folder_id,
            dsPrefix,
            model
          );
        } catch (err) {
          console.warn(
            "Drive version detection failed, using Supabase version:",
            err instanceof Error ? err.message : String(err)
          );
        }
      }

      const isRegenerate = mode === "regenerate";
      const currentVer = product.current_version || "0.0";
      const hasExistingVersion = currentVer !== "0.0";

      if (isRegenerate && hasExistingVersion) {
        newVersion = currentVer;
      } else {
        newVersion = driveVersion
          ? bumpVersion(driveVersion)
          : (() => {
              const parts = currentVer.split(".");
              const major = parseInt(parts[0]) || 1;
              const minor = (parseInt(parts[1]) || 0) + 1;
              return `${major}.${minor}`;
            })();
      }
    }

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

    // Pass lang and mode to the preview page
    const translationMode = isLocalized ? "full" : "light"; // Default to full for localized PDFs
    const previewUrl = isLocalized
      ? `${baseUrl}/preview/${model}?lang=${lang}&mode=${translationMode}`
      : `${baseUrl}/preview/${model}`;

    await page.goto(previewUrl, {
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
    const langSuffix = isLocalized ? `_${getLocaleSuffix(lang)}` : "";
    const fileName = `${dsPrefix}_${model}_v${newVersion}${langSuffix}.pdf`;
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

    // Step 4: Upload to Google Drive (locale-specific folder)
    let driveResult = null;
    if (productLine.drive_folder_id) {
      try {
        driveResult = await uploadPdfToDrive(
          productLine.drive_folder_id,
          dsPrefix,
          model,
          newVersion,
          pdfBuffer,
          null, // For localized, always create new folder if needed
          isLocalized ? lang : undefined
        );
      } catch (err) {
        console.error(
          "Drive upload failed (PDF still saved to Supabase):",
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    // Step 5: Update Supabase records
    const isRegenerate = mode === "regenerate";
    const hasExistingVersion = isLocalized
      ? (currentVersions[lang] || "0.0") !== "0.0"
      : (product.current_version || "0.0") !== "0.0";

    if (isRegenerate && hasExistingVersion) {
      // Try to update existing version record
      const { data: existingVersion } = await supabase
        .from("versions")
        .select("id")
        .eq("product_id", product.id)
        .eq("version", newVersion)
        .eq("locale", lang)
        .order("generated_at", { ascending: false })
        .limit(1)
        .single();

      if (existingVersion) {
        await supabase
          .from("versions")
          .update({
            pdf_storage_path: pdfUrl,
            changes: `PDF regenerated`,
            generated_at: new Date().toISOString(),
          })
          .eq("id", existingVersion.id);
      } else {
        await supabase.from("versions").insert({
          product_id: product.id,
          version: newVersion,
          locale: lang,
          changes: `PDF regenerated`,
          pdf_storage_path: pdfUrl,
        });
      }
    } else {
      await supabase.from("versions").insert({
        product_id: product.id,
        version: newVersion,
        locale: lang,
        changes: `PDF generated${hasExistingVersion ? ` (new version)` : " (initial)"}`,
        pdf_storage_path: pdfUrl,
      });
    }

    // Update current_version(s) with optimistic locking
    // Re-read current_versions to merge safely (prevents overwriting concurrent changes to other locales)
    const { data: freshProduct } = await supabase
      .from("products")
      .select("current_versions")
      .eq("id", product.id)
      .single();

    const freshVersions = (freshProduct?.current_versions ?? {}) as Record<string, string>;

    if (isLocalized) {
      const updatedVersions = { ...freshVersions, [lang]: newVersion };
      await supabase
        .from("products")
        .update({ current_versions: updatedVersions })
        .eq("id", product.id);
    } else {
      const updatedVersions = { ...freshVersions, en: newVersion };
      await supabase
        .from("products")
        .update({
          current_version: newVersion,
          current_versions: updatedVersions,
        })
        .eq("id", product.id);
    }

    await supabase.from("change_logs").insert({
      product_id: product.id,
      product_line_id: product.product_line_id,
      changes_summary: isRegenerate
        ? `Regenerated PDF v${newVersion}${isLocalized ? ` (${lang})` : ""}`
        : `Generated PDF v${newVersion}${isLocalized ? ` (${lang})` : ""}`,
    });

    // --- Release lock ---
    await releaseLock();

    return NextResponse.json({
      ok: true,
      model,
      locale: lang,
      version: newVersion,
      fileName,
      pdfUrl,
      driveFileId: driveResult?.fileId ?? null,
      driveLink: driveResult?.webViewLink ?? null,
    });
  } catch (err) {
    // --- Release lock on failure ---
    await releaseLock();

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
