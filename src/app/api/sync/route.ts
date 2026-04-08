import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadAllProductsFromSheet,
  loadProductFromSheets,
  getSheetMetadata,
} from "@/lib/google/sheets";
import { syncProductImages } from "@/lib/google/drive-images";
import { sendNotifications } from "@/lib/notifications";
import {
  loadRevisionLogs,
  loadComparison,
  loadCloudComparison,
} from "@/lib/google/sheets-extra";
import type { ChangeEntry } from "@/lib/notifications";
import type { SheetSpecSection } from "@/lib/google/sheets";
import type { ProductLine } from "@/types/database";

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
  // Verify authorization (cron secret or service role key)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const linesToSync = filterLine
    ? productLines.filter((pl) => pl.name === filterLine)
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
            .select("id, subtitle, full_name, headline, overview, features, status")
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

          // Even if no content changes, always update sheet metadata
          if (!hasChanges && existing) {
            await supabase
              .from("products")
              .update({
                sheet_last_modified: metadata.last_modified,
                sheet_last_editor: metadata.last_editor,
              })
              .eq("id", existing.id);
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

          // Sync images from Google Drive → Supabase Storage
          try {
            const images = await syncProductImages(modelName, supabase, pl.ds_images_folder_id);
            if (images.product_image_url || images.hardware_image_url) {
              await supabase
                .from("products")
                .update({
                  ...(images.product_image_url && {
                    product_image: images.product_image_url,
                  }),
                  ...(images.hardware_image_url && {
                    hardware_image: images.hardware_image_url,
                  }),
                })
                .eq("id", product.id);
            }
          } catch {
            // Image sync is optional — continue without images
          }

          // Replace spec sections + items
          await supabase
            .from("spec_sections")
            .delete()
            .eq("product_id", product.id);

          await syncSpecSections(supabase, product.id, sheetData.spec_sections);

          // Log the change (only when something actually changed)
          await supabase.from("change_logs").insert({
            product_id: product.id,
            product_line_id: pl.id,
            edited_by: metadata.last_editor,
            edited_at: metadata.last_modified,
            changes_summary: changeSummary,
            changes_detail: isNew ? [{ field: "Product", from: null, to: modelName, type: "added" }] : details,
          });

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
    } catch (err) {
      lineResult.errors.push(
        `Sheet error: ${err instanceof Error ? err.message : String(err)}`
      );
    }

      // Sync extra tabs: Revision Log, Comparison, Cloud Comparison
      try {
        // Revision Log
        if (pl.revision_log_gid) {
          const revLogs = await loadRevisionLogs(pl.sheet_id, pl.revision_log_gid);
          if (revLogs.length > 0) {
            // Replace all revision logs for this product line
            await supabase
              .from("revision_logs")
              .delete()
              .eq("product_line_id", pl.id);
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
              await supabase.from("revision_logs").insert(batch);
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
            await supabase
              .from("comparisons")
              .delete()
              .eq("product_line_id", pl.id);
            for (let b = 0; b < comp.items.length; b += 50) {
              const batch = comp.items.slice(b, b + 50).map((item, idx) => ({
                product_line_id: pl.id,
                model_name: item.model_name,
                category: item.category,
                label: item.label,
                value: item.value,
                sort_order: b + idx,
              }));
              await supabase.from("comparisons").insert(batch);
            }

            // Log comparison changes if any
            if (compChanges.details.length > 0) {
              await supabase.from("change_logs").insert({
                product_id: null,
                product_line_id: pl.id,
                edited_by: metadata.last_editor,
                edited_at: metadata.last_modified,
                changes_summary: `Comparison: ${compChanges.summary}`,
                changes_detail: compChanges.details,
              });

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
            await supabase
              .from("cloud_comparisons")
              .delete()
              .eq("product_line_id", pl.id);
            const batch = cloud.map((c, idx) => ({
              product_line_id: pl.id,
              model_name: c.model_name,
              label: c.label || null,
              specs: c.specs,
              sort_order: idx,
            }));
            await supabase.from("cloud_comparisons").insert(batch);
          }
        }
      } catch (err) {
        lineResult.errors.push(
          `Extra tabs: ${err instanceof Error ? err.message : String(err)}`
        );
      }

    // Update last_synced_at for Smart Sync
    await supabase
      .from("product_lines")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", pl.id);

    results.push(lineResult);
  }

  // Send notifications for synced changes (non-blocking)
  let notifyResult = null;
  if (allChanges.length > 0) {
    try {
      notifyResult = await sendNotifications(allChanges);
      // Mark change logs as notified if at least one channel succeeded
      if (notifyResult.sent.length > 0) {
        await supabase
          .from("change_logs")
          .update({ notified: true })
          .eq("notified", false);
      }
    } catch {
      // Notification failure should not break the sync response
    }
  }

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    results,
    notifications: notifyResult,
  });
}

// Also allow GET for easy testing via browser
export async function GET(request: Request) {
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

async function syncSpecSections(
  supabase: ReturnType<typeof createAdminClient>,
  productId: string,
  sections: SheetSpecSection[]
) {
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];

    const { data: sectionRow } = await supabase
      .from("spec_sections")
      .insert({
        product_id: productId,
        category: section.category,
        sort_order: i,
      })
      .select("id")
      .single();

    if (!sectionRow) continue;

    const items = section.items.map((item, j) => ({
      section_id: sectionRow.id,
      label: item.label,
      value: item.value,
      sort_order: j,
    }));

    if (items.length > 0) {
      await supabase.from("spec_items").insert(items);
    }
  }
}
