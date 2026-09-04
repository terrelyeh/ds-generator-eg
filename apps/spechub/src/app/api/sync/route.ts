import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gateOrCron, requireCron } from "@eg/auth/session";
import { logIfDbError, throwIfDbError } from "@eg/db/errors";
import {
  loadAllProductsFromSheet,
  loadProductFromSheets,
  getSheetMetadata,
} from "@/lib/google/sheets";
import {
  syncProductImages,
  canClear,
  syncLocalizedHardwareImage,
  syncSeriesImages,
} from "@/lib/google/drive-images";
import { sendNotifications } from "@/lib/notifications";
import {
  loadRevisionLogs,
  loadComparison,
  loadCloudComparison,
  loadLineDatasheetContent,
  loadSeriesSpecs,
} from "@/lib/google/sheets-extra";
import type { ChangeEntry } from "@/lib/notifications";
import type { SheetSpecSection } from "@/lib/google/sheets";
import type { ProductLine } from "@eg/db/types";

// Hobby plan limit: 60s. Pro plan: up to 300s. Setting to plan-safe 60s.
// The locale folder resolution cache (below) keeps per-product-line sync
// well within this budget by eliminating redundant Drive API lookups.
/**
 * A forced full-line sync re-downloads and re-trims every image for every
 * product, and the Data Center lines carry three large renders each. Measured
 * on production: two products took 61s and were killed at the old 60s ceiling.
 * EnGenie's ingest routes have run at 300 for months, so the platform allows
 * it — 60 was a default nobody revisited, not a decision.
 */
export const maxDuration = 300;

/**
 * POST /api/sync
 *
 * Syncs product data from Google Sheets → Supabase.
 * Intended to be called by Vercel Cron (daily) or manually.
 *
 * Query params:
 *   ?line=Cloud Camera    — sync only one product line
 *   ?model=ECC100         — sync only one model
 */
export async function POST(request: Request) {
  // Vercel cron / CRON_SECRET bearer / signed-in editor+admin users only.
  const denied = await gateOrCron(request, "sync.run");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const filterLine = searchParams.get("line");
  const filterModel = searchParams.get("model");
  const forceSync = searchParams.get("force") === "true";

  const supabase = createAdminClient();

  // Get all product lines from DB
  const { data: productLines, error: plError } = (await supabase
    .from("product_lines")
    .select("*")) as { data: ProductLine[] | null; error: { message: string } | null };

  if (plError || !productLines) {
    return NextResponse.json(
      { error: "Failed to fetch product lines", details: plError?.message },
      { status: 500 }
    );
  }

  // When only `?model=X` is given, look up which product line owns
  // that model so we don't iterate all 7 lines doing pointless Sheet
  // reads — each probe costs ~3 API calls and on Hobby's 60s budget
  // that 6× overhead is the difference between pass and 504 timeout.
  let narrowedByModel: string | null = null;
  if (filterModel && !filterLine) {
    const { data: ownerRow } = await supabase
      .from("products")
      .select("product_lines!inner(name)")
      .eq("model_name", filterModel)
      .maybeSingle() as {
        data: { product_lines: { name: string } | { name: string }[] } | null;
      };
    const pl = ownerRow?.product_lines;
    narrowedByModel = Array.isArray(pl) ? pl[0]?.name ?? null : pl?.name ?? null;
  }

  const effectiveLine = filterLine ?? narrowedByModel;
  const linesToSync = effectiveLine
    ? productLines.filter((pl) => pl.name === effectiveLine)
    : productLines;

  const results: {
    line: string;
    synced: string[];
    errors: string[];
    skipped?: boolean;
  }[] = [];

  // Collect changes for notifications
  const allChanges: ChangeEntry[] = [];

  for (const pl of linesToSync) {
    if (!pl.sheet_id || !pl.detail_specs_gid) continue;

    const lineResult: typeof results[number] = { line: pl.name, synced: [], errors: [] };

    // Get sheet metadata (last modified, last editor) — uses Drive API
    let metadata: { last_modified: string | null; last_editor: string | null } = {
      last_modified: null,
      last_editor: null,
    };
    try {
      metadata = await getSheetMetadata(pl.sheet_id);
    } catch {
      // Drive API not available — Smart Sync won't work, fall through to full sync
    }

    // Did the whole line actually come back from Sheets this run? Only then
    // is it honest to say the line is synced.
    let fullLineRead = false;

    try {
      // Smart Sync: skip if sheet hasn't changed since last sync
      const sheetModified = metadata.last_modified ? new Date(metadata.last_modified).getTime() : null;
      const lastSynced = pl.last_synced_at ? new Date(pl.last_synced_at).getTime() : null;

      if (
        !forceSync &&
        !filterModel &&
        sheetModified !== null &&
        lastSynced !== null &&
        sheetModified <= lastSynced
      ) {
        results.push({ line: pl.name, synced: [], errors: [], skipped: true });
        continue;
      }

      // Batch-load all models from both tabs in 3 API calls (instead of 3 per model)
      let allProducts: Map<string, import("@/lib/google/sheets").SheetProduct>;

      if (filterModel) {
        // Single model: use targeted fetch (3 API calls)
        const single = await loadProductFromSheets(
          pl.sheet_id,
          pl.detail_specs_gid,
          pl.overview_gid ?? "0",
          filterModel
        );
        allProducts = new Map();
        if (single) allProducts.set(filterModel, single);
      } else {
        // All models: batch fetch (3 API calls total per product line)
        allProducts = await loadAllProductsFromSheet(
          pl.sheet_id,
          pl.detail_specs_gid,
          pl.overview_gid ?? "0"
        );
      }

      for (const [modelName, sheetData] of allProducts) {
        try {
          // Check if product already exists (for deep change detection)
          const { data: existing } = await supabase
            .from("products")
            .select("id, subtitle, full_name, headline, overview, features, ds_features, status, product_image, hardware_image, hardware_image_2, current_versions")
            .eq("model_name", modelName)
            .single();

          const isNew = !existing;

          // Structured change detail: { field, from, to, type }
          interface ChangeDetail {
            field: string;
            from: string | null;
            to: string | null;
            type: "added" | "removed" | "modified";
          }
          const details: ChangeDetail[] = [];

          if (!isNew) {
            // Field-level diff
            if (existing.subtitle !== sheetData.subtitle)
              details.push({ field: "Subtitle", from: existing.subtitle, to: sheetData.subtitle, type: "modified" });
            if (existing.full_name !== sheetData.full_name)
              details.push({ field: "Full Name", from: existing.full_name, to: sheetData.full_name, type: "modified" });
            if ((existing.headline ?? "") !== sheetData.headline)
              details.push({ field: "Headline", from: existing.headline ?? "", to: sheetData.headline, type: "modified" });
            if ((existing.status ?? "active") !== sheetData.status)
              details.push({ field: "Status", from: existing.status ?? "active", to: sheetData.status, type: "modified" });
            if (existing.overview !== sheetData.overview)
              details.push({ field: "Overview", from: "(previous)", to: "(updated)", type: "modified" });

            // Features diff
            if (JSON.stringify(existing.features) !== JSON.stringify(sheetData.features)) {
              const oldF = (existing.features as string[]) ?? [];
              const newF = sheetData.features;
              for (const f of newF.filter((x) => !oldF.includes(x)))
                details.push({ field: "Feature", from: null, to: f, type: "added" });
              for (const f of oldF.filter((x) => !newF.includes(x)))
                details.push({ field: "Feature", from: f, to: null, type: "removed" });
            }

            // DS Feature Groups diff (coarse — content lives in one cell).
            // Without this, edits that ONLY touch the "DS Feature Groups"
            // row would be invisible to hasChanges and never reach the DB.
            if (
              JSON.stringify(existing.ds_features ?? null) !==
              JSON.stringify(sheetData.ds_features ?? null)
            ) {
              details.push({ field: "DS Feature Groups", from: "(previous)", to: "(updated)", type: "modified" });
            }

            // Spec-level diff
            const { data: oldSections } = await supabase
              .from("spec_sections")
              .select("category, spec_items (label, value)")
              .eq("product_id", existing.id)
              .order("sort_order");

            const oldSpecMap = new Map<string, Map<string, string>>();
            for (const s of oldSections ?? []) {
              const items = new Map<string, string>();
              for (const i of (s.spec_items as { label: string; value: string }[]) ?? [])
                items.set(i.label, i.value);
              oldSpecMap.set(s.category, items);
            }

            const newSpecMap = new Map<string, Map<string, string>>();
            for (const s of sheetData.spec_sections) {
              const items = new Map<string, string>();
              for (const i of s.items) items.set(i.label, i.value);
              newSpecMap.set(s.category, items);
            }

            // New / removed sections
            for (const cat of newSpecMap.keys()) {
              if (!oldSpecMap.has(cat))
                details.push({ field: `Section: ${cat}`, from: null, to: "(new section)", type: "added" });
            }
            for (const cat of oldSpecMap.keys()) {
              if (!newSpecMap.has(cat))
                details.push({ field: `Section: ${cat}`, from: "(removed)", to: null, type: "removed" });
            }

            // Changed items within shared sections
            for (const [cat, newItems] of newSpecMap) {
              const oldItems = oldSpecMap.get(cat);
              if (!oldItems) continue;
              for (const [label, newVal] of newItems) {
                const oldVal = oldItems.get(label);
                if (oldVal === undefined) {
                  details.push({ field: `${cat} > ${label}`, from: null, to: newVal, type: "added" });
                } else if (oldVal !== newVal) {
                  details.push({ field: `${cat} > ${label}`, from: oldVal, to: newVal, type: "modified" });
                }
              }
              for (const [label, oldVal] of oldItems) {
                if (!newItems.has(label))
                  details.push({ field: `${cat} > ${label}`, from: oldVal, to: null, type: "removed" });
              }
            }
          }

          const hasChanges = isNew || details.length > 0;

          // Even if no content changes, always update sheet metadata + sync images
          // Smart sync: always check Drive for updated images (not just missing ones)
          if (!hasChanges && existing) {
            const updateFields: Record<string, unknown> = {
              sheet_last_modified: metadata.last_modified,
              sheet_last_editor: metadata.last_editor,
            };

            try {
              const imgResult = await syncProductImages(modelName, supabase, pl.ds_images_folder_id, {
                existingImages: {
                  product_image: existing.product_image || undefined,
                  hardware_image: existing.hardware_image || undefined,
                  hardware_image_2: existing.hardware_image_2 || undefined,
                },
                force: forceSync,
              });
              if (imgResult.product_image_url) {
                updateFields.product_image = imgResult.product_image_url;
              } else if (canClear(imgResult, "product_image") && existing.product_image) {
                // Drive confirmed the file no longer exists → clear DB.
                // The column is NOT NULL DEFAULT '' — writing null threw a
                // 23502 that supabase-js returns rather than raises, so the
                // whole update (including the sheet metadata above) was
                // silently dropped and stale images never cleared.
                updateFields.product_image = "";
              }
              if (imgResult.hardware_image_url) {
                updateFields.hardware_image = imgResult.hardware_image_url;
              } else if (canClear(imgResult, "hardware_image") && existing.hardware_image) {
                updateFields.hardware_image = "";
              }
              if (imgResult.hardware_image_2_url) {
                updateFields.hardware_image_2 = imgResult.hardware_image_2_url;
              } else if (canClear(imgResult, "hardware_image_2") && existing.hardware_image_2) {
                updateFields.hardware_image_2 = "";
              }
            } catch { /* image sync failure is non-fatal */ }

            throwIfDbError(`${modelName} products update`)(
              await supabase.from("products").update(updateFields).eq("id", existing.id),
            );

            // Sync localized hardware images (one per enabled locale).
            // Reads each sibling "<ProductLine>_<locale>/DS Images" folder
            // and writes product_translations.hardware_image.
            if (pl.ds_images_folder_id && pl.name) {
              const enabledLocales = Object.keys(
                (existing.current_versions as Record<string, string> | null) ?? {},
              ).filter((l) => l && l !== "en");
              for (const locale of enabledLocales) {
                try {
                  await syncLocalizedHardwareImage({
                    modelName,
                                        locale,
                    lineName: pl.name,
                    enDsImagesFolderId: pl.ds_images_folder_id,
                    supabase,
                  });
                } catch { /* non-fatal */ }
              }
            }

            lineResult.synced.push(modelName);
            continue;
          }

          // Upsert product
          const { data: product, error: productError } = await supabase
            .from("products")
            .upsert(
              {
                product_line_id: pl.id,
                model_name: sheetData.model_name,
                subtitle: sheetData.subtitle,
                full_name: sheetData.full_name,
                headline: sheetData.headline,
                overview: sheetData.overview,
                features: sheetData.features,
                ds_features: sheetData.ds_features,
                status: sheetData.status,
                sheet_last_modified: metadata.last_modified,
                sheet_last_editor: metadata.last_editor,
              },
              { onConflict: "model_name" }
            )
            .select("id")
            .single();

          if (productError || !product) {
            lineResult.errors.push(
              `${modelName}: product upsert failed — ${productError?.message}`
            );
            continue;
          }

          // Build change summary (compact one-liner for notifications)
          const changeSummary = isNew
            ? "New product added"
            : buildSummaryText(details);

          // Sync images from Google Drive → Supabase Storage (smart: skip if unchanged)
          try {
            const images = await syncProductImages(modelName, supabase, pl.ds_images_folder_id, {
              existingImages: existing ? {
                product_image: existing.product_image || undefined,
                hardware_image: existing.hardware_image || undefined,
                hardware_image_2: existing.hardware_image_2 || undefined,
              } : undefined,
              force: forceSync,
            });
            // "" (not null) — the columns are NOT NULL DEFAULT ''.
            const imageUpdate: Record<string, string> = {};
            if (images.product_image_url) {
              imageUpdate.product_image = images.product_image_url;
            } else if (canClear(images, "product_image") && existing?.product_image) {
              imageUpdate.product_image = "";
            }
            if (images.hardware_image_url) {
              imageUpdate.hardware_image = images.hardware_image_url;
            } else if (canClear(images, "hardware_image") && existing?.hardware_image) {
              imageUpdate.hardware_image = "";
            }
            if (images.hardware_image_2_url) {
              imageUpdate.hardware_image_2 = images.hardware_image_2_url;
            } else if (canClear(images, "hardware_image_2") && existing?.hardware_image_2) {
              imageUpdate.hardware_image_2 = "";
            }
            if (Object.keys(imageUpdate).length > 0) {
              // Reported rather than thrown: the enclosing catch exists for
              // Drive being unreachable, and it would swallow this too.
              const res = await supabase
                .from("products")
                .update(imageUpdate)
                .eq("id", product.id);
              if (!logIfDbError(`${modelName} products image update`, res)) {
                lineResult.errors.push(`${modelName}: image URLs not saved`);
              }
            }
          } catch {
            // Image sync is optional — continue without images
          }

          // Sync localized hardware images for each enabled locale.
          // Writes product_translations.hardware_image per locale.
          try {
            if (pl.ds_images_folder_id && pl.name) {
              const enabledLocales = Object.keys(
                (existing?.current_versions as Record<string, string> | null) ?? {},
              ).filter((l) => l && l !== "en");
              for (const locale of enabledLocales) {
                await syncLocalizedHardwareImage({
                  modelName,
                                    locale,
                  lineName: pl.name,
                  enDsImagesFolderId: pl.ds_images_folder_id,
                  supabase,
                });
              }
            }
          } catch {
            // Localized image sync is optional — continue
          }

          // Replace spec sections + items
          await syncSpecSections(supabase, product.id, sheetData.spec_sections, modelName);

          // Log the change (only when something actually changed)
          throwIfDbError(`${modelName} change_logs insert`)(
            await supabase.from("change_logs").insert({
            product_id: product.id,
            product_line_id: pl.id,
            edited_by: metadata.last_editor,
            edited_at: metadata.last_modified,
            changes_summary: changeSummary,
            changes_detail: isNew ? [{ field: "Product", from: null, to: modelName, type: "added" }] : details,
          }));

          lineResult.synced.push(modelName);
          allChanges.push({
            product_name: modelName,
            product_line: pl.label ?? pl.name,
            changes_summary: changeSummary,
            edited_by: metadata.last_editor,
            edited_at: metadata.last_modified,
          });
        } catch (err) {
          lineResult.errors.push(
            `${modelName}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      fullLineRead = true;
    } catch (err) {
      lineResult.errors.push(
        `Sheet error: ${err instanceof Error ? err.message : String(err)}`
      );
    }

      // Sync extra tabs: Revision Log, Comparison, Cloud Comparison.
      // Skip when scoping to a single model — these are line-level
      // datasets (hundreds of rows for Cloud AP) and a per-model
      // resync has no business rewriting them. This is the main
      // reason /api/sync?model=X was hitting Vercel's 60s limit.
      try {
      if (filterModel) {
        // Only the product row itself was re-read; skip line-scoped
        // tables. Cron (daily) and full line syncs still refresh them.
      } else {
        // Revision Log
        if (pl.revision_log_gid) {
          const revLogs = await loadRevisionLogs(pl.sheet_id, pl.revision_log_gid);
          if (revLogs.length > 0) {
            // Replace all revision logs for this product line
            throwIfDbError("revision_logs delete")(
              await supabase.from("revision_logs").delete().eq("product_line_id", pl.id),
            );
            // Insert in batches of 50
            for (let b = 0; b < revLogs.length; b += 50) {
              const batch = revLogs.slice(b, b + 50).map((r) => ({
                product_line_id: pl.id,
                revision_date: r.revision_date,
                parsed_date: r.parsed_date,
                editor: r.editor,
                action: r.action,
                target_page: r.target_page,
                change_type: r.change_type,
                description: r.description,
                mkt_close_date: r.mkt_close_date || null,
              }));
              throwIfDbError("revision_logs insert")(
                await supabase.from("revision_logs").insert(batch),
              );
            }
          }
        }

        // Comparison (with diff detection)
        if (pl.comparison_gid) {
          const comp = await loadComparison(pl.sheet_id, pl.comparison_gid);
          if (comp.items.length > 0) {
            // Fetch existing comparison data BEFORE replacing
            const { data: existingComp } = await supabase
              .from("comparisons")
              .select("model_name, category, label, value")
              .eq("product_line_id", pl.id);

            // Diff comparison data
            const compChanges = diffComparison(existingComp ?? [], comp.items);

            // Replace all comparison data
            throwIfDbError("comparisons delete")(
              await supabase.from("comparisons").delete().eq("product_line_id", pl.id),
            );
            for (let b = 0; b < comp.items.length; b += 50) {
              const batch = comp.items.slice(b, b + 50).map((item, idx) => ({
                product_line_id: pl.id,
                model_name: item.model_name,
                category: item.category,
                label: item.label,
                value: item.value,
                sort_order: b + idx,
              }));
              throwIfDbError("comparisons insert")(
                await supabase.from("comparisons").insert(batch),
              );
            }

            // Log comparison changes if any
            if (compChanges.details.length > 0) {
              throwIfDbError("comparison change_logs insert")(
                await supabase.from("change_logs").insert({
                product_id: null,
                product_line_id: pl.id,
                edited_by: metadata.last_editor,
                edited_at: metadata.last_modified,
                changes_summary: `Comparison: ${compChanges.summary}`,
                changes_detail: compChanges.details,
              }));

              allChanges.push({
                product_name: "[Comparison]",
                product_line: pl.label ?? pl.name,
                changes_summary: compChanges.summary,
                edited_by: metadata.last_editor,
                edited_at: metadata.last_modified,
              });
            }
          }
        }

        // Cloud Comparison
        if (pl.cloud_comparison_gid) {
          const cloud = await loadCloudComparison(
            pl.sheet_id,
            pl.cloud_comparison_gid
          );
          if (cloud.length > 0) {
            throwIfDbError("cloud_comparisons delete")(
              await supabase.from("cloud_comparisons").delete().eq("product_line_id", pl.id),
            );
            const batch = cloud.map((c, idx) => ({
              product_line_id: pl.id,
              model_name: c.model_name,
              label: c.label || null,
              specs: c.specs,
              sort_order: idx,
            }));
            throwIfDbError("cloud_comparisons insert")(
              await supabase.from("cloud_comparisons").insert(batch),
            );
          }
        }

        // Line-level shared datasheet content ("[For DS] Overview &
        // Features" tab). Feeds BOTH the per-model datasheets and the
        // series one, so it syncs whenever the line configures the tab —
        // independent of ds_scope.
        if (pl.ds_overview_gid) {
          const lineContent = await loadLineDatasheetContent(
            pl.sheet_id,
            pl.ds_overview_gid,
          );
          if (lineContent) {
            // Header-band label: explicit row wins, else the line's
            // category minus its plural "s" ("AI Servers" → "AI Server").
            const categoryLabel =
              lineContent.category_label || pl.category.replace(/s\s*$/i, "");

            // Series-scope lines also carry a curated comparison table and
            // series_* imagery; per-model lines need neither.
            const wantsSeries = pl.ds_scope === "series" || pl.ds_scope === "both";

            const seriesSpecs =
              wantsSeries && pl.ds_specs_gid
                ? await loadSeriesSpecs(pl.sheet_id, pl.ds_specs_gid)
                : null;

            let seriesImages = null;
            if (wantsSeries) {
              const { data: lineProducts } = (await supabase
                .from("products")
                .select("model_name")
                .eq("product_line_id", pl.id)) as {
                  data: { model_name: string }[] | null;
                };
              const res = await syncSeriesImages({
                lineName: pl.name,
                dsImagesFolderId: pl.ds_images_folder_id,
                modelNames: (lineProducts ?? []).map((p) => p.model_name),
                supabase,
              });
              if (res.folder_listed) seriesImages = res.images;
            }

            const upsertRes = await supabase
              .from("line_datasheets")
              .upsert(
                {
                  product_line_id: pl.id,
                  ...(seriesSpecs ? { specs: seriesSpecs } : {}),
                  ...(seriesImages ? { images: seriesImages } : {}),
                  headline: lineContent.headline || null,
                  series_name: lineContent.series_name || null,
                  category_label: categoryLabel,
                  overview: lineContent.overview || null,
                  features: lineContent.features,
                  benefits: lineContent.benefits,
                  software_arch: lineContent.software_arch || null,
                  footnote: lineContent.footnote || null,
                  last_synced_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "product_line_id" },
              );
            // Pitfall #45 — supabase writes fail silently unless checked.
            if (upsertRes.error) {
              lineResult.errors.push(
                `Line datasheet content: ${upsertRes.error.message}`,
              );
            }
          }
        }
      }
      } catch (err) {
        lineResult.errors.push(
          `Extra tabs: ${err instanceof Error ? err.message : String(err)}`
        );
      }

    // Update last_synced_at for Smart Sync
    // Stamp only when this run really read the whole line.
    //
    // It used to stamp unconditionally, which made the timestamp a lie in two
    // ways. A Sheets 429 recorded the error and then marked the line synced,
    // so the next cron skipped it. And `?model=X` — the per-product Resync
    // button — stamped the LINE, so an editor resyncing one model at 10:05
    // silently cancelled tomorrow's sync of every edit anyone else had made
    // to that sheet.
    if (fullLineRead && !filterModel) {
      const stampRes = await supabase
        .from("product_lines")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", pl.id);
      if (!logIfDbError(`${pl.name} last_synced_at`, stampRes)) {
        lineResult.errors.push("last_synced_at not updated — Smart Sync may re-run this line");
      }
    }

    results.push(lineResult);
  }

  // Send notifications for synced changes (non-blocking)
  let notifyResult = null;
  if (allChanges.length > 0) {
    try {
      notifyResult = await sendNotifications(allChanges);
      // Mark change logs as notified if at least one channel succeeded
      if (notifyResult.sent.length > 0) {
        throwIfDbError("change_logs notified")(
          await supabase.from("change_logs").update({ notified: true }).eq("notified", false),
        );
      }
    } catch {
      // Notification failure should not break the sync response
    }
  }

  // Auto re-index RAG embeddings for products that changed. The RAG
  // pipeline lives in apps/engenie (monorepo split), so we trigger its
  // internal endpoint with the shared CRON_SECRET, narrowed to the changed
  // models. Failure must not break the sync response — EnGenie's daily
  // backstop cron (09:30 TW) re-indexes everything with hash-skip anyway.
  let reindexResult: { processed: number; skipped: number; errors: number } | null = null;
  if (allChanges.length > 0) {
    try {
      const base = process.env.ENGENIE_INTERNAL_URL;
      const secret = process.env.CRON_SECRET;
      if (!base || !secret) {
        console.warn(
          "EnGenie re-index skipped: ENGENIE_INTERNAL_URL / CRON_SECRET not set (daily backstop cron will catch up)"
        );
      } else {
        const changedModels = [...new Set(allChanges.map((c) => c.product_name))];
        const r = await fetch(`${base.replace(/\/$/, "")}/api/cron/reindex-products`, {
          // EnGenie embeds synchronously, so a large batch can outlast this
          // function and turn a finished sync into a 504 that reads as the
          // sync having failed. The daily 09:30 backstop covers everything
          // anyway, which is the whole reason this call is allowed to fail.
          signal: AbortSignal.timeout(10_000),
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secret}`,
          },
          body: JSON.stringify({ models: changedModels }),
        });
        if (r.ok) {
          const data = (await r.json()) as {
            processed?: number;
            skipped?: number;
            errors?: number;
          };
          reindexResult = {
            processed: data.processed ?? 0,
            skipped: data.skipped ?? 0,
            errors: data.errors ?? 0,
          };
        } else {
          console.warn("EnGenie re-index trigger failed:", r.status, await r.text());
        }
      }
    } catch (err) {
      // Re-index failure should not break the sync response
      console.warn("EnGenie re-index trigger failed:", err);
    }
  }

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    results,
    notifications: notifyResult,
    reindex: reindexResult,
  });
}

/**
 * GET — this is how Vercel Cron invokes the daily 09:00 TW sync.
 *
 * There used to be a plain `return POST(request)` here for browser testing,
 * and it was removed on the reasoning that a GET carries cookies on a link
 * click, so `/api/sync?force=true` in a chat message was a one-click full
 * resync for anyone signed in. That reasoning stands. What it missed is that
 * the scheduler uses GET too — the next morning's run answered 405 and the
 * sync did not happen, which nothing would have reported.
 *
 * So the method comes back and the session does not: only the cron bearer
 * gets through here. A person clicking a link has cookies and no secret, and
 * the Sync button posts.
 */
export async function GET(request: Request) {
  const denied = await requireCron(request);
  if (denied) return denied;
  return POST(request);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a ChangeDetail[] array into a compact one-line summary.
 * e.g. "overview modified, 3 features added, 2 specs modified"
 */
function buildSummaryText(
  details: { field: string; type: "added" | "removed" | "modified" }[]
): string {
  const parts: string[] = [];

  // Top-level field changes (Overview, Subtitle, Full Name, Headline)
  const fieldChanges = details.filter(
    (d) =>
      !d.field.includes(" > ") &&
      !d.field.startsWith("Section: ") &&
      d.field !== "Feature"
  );
  for (const d of fieldChanges) {
    parts.push(`${d.field.toLowerCase()} ${d.type}`);
  }

  // Feature counts
  const featAdded = details.filter((d) => d.field === "Feature" && d.type === "added").length;
  const featRemoved = details.filter((d) => d.field === "Feature" && d.type === "removed").length;
  if (featAdded) parts.push(`${featAdded} feature${featAdded > 1 ? "s" : ""} added`);
  if (featRemoved) parts.push(`${featRemoved} feature${featRemoved > 1 ? "s" : ""} removed`);

  // Section counts
  const sectAdded = details.filter((d) => d.field.startsWith("Section: ") && d.type === "added").length;
  const sectRemoved = details.filter((d) => d.field.startsWith("Section: ") && d.type === "removed").length;
  if (sectAdded) parts.push(`${sectAdded} section${sectAdded > 1 ? "s" : ""} added`);
  if (sectRemoved) parts.push(`${sectRemoved} section${sectRemoved > 1 ? "s" : ""} removed`);

  // Spec item counts (fields containing " > ")
  const specAdded = details.filter((d) => d.field.includes(" > ") && d.type === "added").length;
  const specRemoved = details.filter((d) => d.field.includes(" > ") && d.type === "removed").length;
  const specModified = details.filter((d) => d.field.includes(" > ") && d.type === "modified").length;
  if (specAdded) parts.push(`${specAdded} spec${specAdded > 1 ? "s" : ""} added`);
  if (specRemoved) parts.push(`${specRemoved} spec${specRemoved > 1 ? "s" : ""} removed`);
  if (specModified) parts.push(`${specModified} spec${specModified > 1 ? "s" : ""} modified`);

  return parts.join(", ") || "minor changes";
}

/**
 * Diff old vs new comparison data and return a summary + detail array.
 */
function diffComparison(
  oldRows: { model_name: string; category: string; label: string; value: string }[],
  newRows: { model_name: string; category: string; label: string; value: string }[]
): {
  summary: string;
  details: { field: string; from: string | null; to: string | null; type: "added" | "removed" | "modified" }[];
} {
  // Skip diff if this is the first load (no existing data = baseline)
  if (oldRows.length === 0) {
    return { summary: "", details: [] };
  }

  const makeKey = (r: { model_name: string; category: string; label: string }) =>
    `${r.model_name}\x00${r.category}\x00${r.label}`;

  const oldMap = new Map<string, string>();
  const oldModels = new Set<string>();
  for (const r of oldRows) {
    oldMap.set(makeKey(r), r.value);
    oldModels.add(r.model_name);
  }

  const newMap = new Map<string, string>();
  const newModels = new Set<string>();
  for (const r of newRows) {
    newMap.set(makeKey(r), r.value);
    newModels.add(r.model_name);
  }

  const details: { field: string; from: string | null; to: string | null; type: "added" | "removed" | "modified" }[] = [];

  // New models
  for (const m of newModels) {
    if (!oldModels.has(m))
      details.push({ field: `Model: ${m}`, from: null, to: "(added)", type: "added" });
  }
  // Removed models
  for (const m of oldModels) {
    if (!newModels.has(m))
      details.push({ field: `Model: ${m}`, from: "(removed)", to: null, type: "removed" });
  }

  // Spec-level diff for models that exist in both
  for (const [key, newVal] of newMap) {
    const oldVal = oldMap.get(key);
    const [model, cat, label] = key.split("\x00");
    if (oldVal === undefined && oldModels.has(model)) {
      details.push({ field: `${model} > ${cat} > ${label}`, from: null, to: newVal, type: "added" });
    } else if (oldVal !== undefined && oldVal !== newVal) {
      details.push({ field: `${model} > ${cat} > ${label}`, from: oldVal, to: newVal, type: "modified" });
    }
  }
  for (const [key, oldVal] of oldMap) {
    if (!newMap.has(key)) {
      const [model, cat, label] = key.split("\x00");
      if (newModels.has(model)) {
        details.push({ field: `${model} > ${cat} > ${label}`, from: oldVal, to: null, type: "removed" });
      }
    }
  }

  // Build summary
  const modelsAdded = details.filter((d) => d.field.startsWith("Model: ") && d.type === "added").length;
  const modelsRemoved = details.filter((d) => d.field.startsWith("Model: ") && d.type === "removed").length;
  const valuesChanged = details.filter((d) => !d.field.startsWith("Model: ")).length;

  const parts: string[] = [];
  if (modelsAdded) parts.push(`${modelsAdded} model${modelsAdded > 1 ? "s" : ""} added`);
  if (modelsRemoved) parts.push(`${modelsRemoved} model${modelsRemoved > 1 ? "s" : ""} removed`);
  if (valuesChanged) parts.push(`${valuesChanged} value${valuesChanged > 1 ? "s" : ""} changed`);

  return { summary: parts.join(", "), details };
}

/**
 * Replace a product's whole spec table.
 *
 * One RPC, so one transaction (migration 00050). It used to be a `delete`
 * followed by a loop of inserts with nothing around them: between the two the
 * product had no specs, and that window sat inside the slowest part of the
 * slowest line, minutes into a route capped at 60 seconds. A kill in the
 * middle left a product with four categories out of fifteen and reported
 * success — and because `last_synced_at` never got stamped, the NEXT run
 * diffed against the wreckage and logged every section as newly added.
 */
async function syncSpecSections(
  supabase: ReturnType<typeof createAdminClient>,
  productId: string,
  sections: SheetSpecSection[],
  modelName: string,
) {
  throwIfDbError(`${modelName} spec table rewrite`)(
    await supabase.rpc("replace_spec_sections" as never, {
      p_product_id: productId,
      p_sections: sections.map((section, i) => ({
        category: section.category,
        sort_order: i,
        items: section.items.map((item, j) => ({
          label: item.label,
          value: item.value,
          sort_order: j,
        })),
      })),
    } as never),
  );
}
