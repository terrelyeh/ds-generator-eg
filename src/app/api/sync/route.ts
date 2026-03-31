import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listModelsFromSheet,
  loadProductFromSheets,
  getSheetMetadata,
} from "@/lib/google/sheets";
import { syncProductImages } from "@/lib/google/drive-images";
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
  }[] = [];

  for (const pl of linesToSync) {
    if (!pl.sheet_id || !pl.detail_specs_gid) continue;

    const lineResult = { line: pl.name, synced: [] as string[], errors: [] as string[] };

    try {
      // Get sheet metadata (last modified, last editor) — optional, uses Drive API
      let metadata: { last_modified: string | null; last_editor: string | null } = {
        last_modified: null,
        last_editor: null,
      };
      try {
        metadata = await getSheetMetadata(pl.sheet_id);
      } catch {
        // Drive API access may not be available; continue without metadata
      }

      // List all models in this sheet
      const models = await listModelsFromSheet(pl.sheet_id, pl.detail_specs_gid);

      const modelsToSync = filterModel
        ? models.filter((m) => m.model_name === filterModel)
        : models;

      for (const model of modelsToSync) {
        try {
          // Load full product data from sheets
          const sheetData = await loadProductFromSheets(
            pl.sheet_id,
            pl.detail_specs_gid,
            pl.overview_gid ?? "0",
            model.model_name
          );

          if (!sheetData) {
            lineResult.errors.push(`${model.model_name}: not found in sheet`);
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
                overview: sheetData.overview,
                features: sheetData.features,
                sheet_last_modified: metadata.last_modified,
                sheet_last_editor: metadata.last_editor,
              },
              { onConflict: "model_name" }
            )
            .select("id")
            .single();

          if (productError || !product) {
            lineResult.errors.push(
              `${model.model_name}: product upsert failed — ${productError?.message}`
            );
            continue;
          }

          // Sync images from Google Drive → Supabase Storage
          try {
            const images = await syncProductImages(model.model_name, supabase);
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

          // Replace spec sections + items (delete old, insert new)
          await supabase
            .from("spec_sections")
            .delete()
            .eq("product_id", product.id);

          await syncSpecSections(supabase, product.id, sheetData.spec_sections);

          // Log the change
          await supabase.from("change_logs").insert({
            product_id: product.id,
            product_line_id: pl.id,
            edited_by: metadata.last_editor,
            edited_at: metadata.last_modified,
            changes_summary: `Synced from Google Sheets`,
          });

          lineResult.synced.push(model.model_name);
        } catch (err) {
          lineResult.errors.push(
            `${model.model_name}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    } catch (err) {
      lineResult.errors.push(
        `Sheet error: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    results.push(lineResult);
  }

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    results,
  });
}

// Also allow GET for easy testing via browser
export async function GET(request: Request) {
  return POST(request);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
