import { createClient } from "@/lib/supabase/server";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import type { ProductLine } from "@/types/database";

interface ProductRow {
  id: string;
  model_name: string;
  subtitle: string;
  full_name: string;
  current_version: string;
  status: string;
  product_image: string;
  hardware_image: string;
  updated_at: string;
  product_line_id: string;
  product_lines: { name: string; label: string; category: string };
}

interface RadioPatternAsset {
  product_id: string;
  label: string;
  status: string;
}

interface ChangeLogRow {
  product_id: string;
  edited_at: string | null;
  edited_by: string | null;
  changes_summary: string;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: productLines } = (await supabase
    .from("product_lines")
    .select("*")
    .order("sort_order")) as { data: ProductLine[] | null };

  const { data: products } = (await supabase
    .from("products")
    .select(
      `
      id,
      model_name,
      subtitle,
      full_name,
      current_version,
      status,
      product_image,
      hardware_image,
      updated_at,
      product_line_id,
      product_lines (name, label, category)
    `
    )
    .order("model_name")) as { data: ProductRow[] | null };

  // Fetch radio pattern assets (for AP)
  const { data: radioAssets } = (await supabase
    .from("image_assets")
    .select("product_id, label, status")
    .eq("image_type", "radio_pattern")) as {
    data: RadioPatternAsset[] | null;
  };

  // Fetch latest change_log per product (for "Last Edited" column)
  const { data: changeLogs } = (await supabase
    .from("change_logs")
    .select("product_id, edited_at, edited_by, changes_summary")
    .not("product_id", "is", null)
    .order("created_at", { ascending: false })) as {
    data: ChangeLogRow[] | null;
  };

  // Build map: product_id → latest change_log
  const latestChangeMap = new Map<
    string,
    { edited_at: string | null; edited_by: string | null; summary: string }
  >();
  for (const cl of changeLogs ?? []) {
    if (!cl.product_id || latestChangeMap.has(cl.product_id)) continue;
    latestChangeMap.set(cl.product_id, {
      edited_at: cl.edited_at,
      edited_by: cl.edited_by,
      summary: cl.changes_summary,
    });
  }

  // Build radio pattern readiness map: product_id -> { band -> { h: bool, e: bool } }
  const radioMap = new Map<
    string,
    Map<string, { h_plane: boolean; e_plane: boolean }>
  >();
  if (radioAssets) {
    for (const asset of radioAssets) {
      if (!radioMap.has(asset.product_id))
        radioMap.set(asset.product_id, new Map());
      const bands = radioMap.get(asset.product_id)!;
      // Label format: "2.4G H-plane", "5G E-plane", etc.
      const bandMatch = asset.label.match(/^([\d.]+G)\s+(H|E)-plane$/i);
      if (bandMatch) {
        const band = bandMatch[1];
        const plane = bandMatch[2].toLowerCase();
        if (!bands.has(band)) bands.set(band, { h_plane: false, e_plane: false });
        const entry = bands.get(band)!;
        if (plane === "h") entry.h_plane = asset.status !== "missing";
        if (plane === "e") entry.e_plane = asset.status !== "missing";
      }
    }
  }

  const productSummaries = (products ?? []).map((p) => {
    const hasProductImage =
      !!p.product_image && !p.product_image.startsWith("cache/");
    const hasHardwareImage =
      !!p.hardware_image && !p.hardware_image.startsWith("cache/");

    // Build radio patterns array for AP products
    const radioPatterns: { band: string; h_plane: boolean; e_plane: boolean }[] =
      [];
    const bands = radioMap.get(p.id);
    if (bands) {
      // Sort: 2.4G, 5G, 6G
      const order = ["2.4G", "5G", "6G"];
      for (const band of order) {
        if (bands.has(band)) radioPatterns.push({ band, ...bands.get(band)! });
      }
    }

    const latestChange = latestChangeMap.get(p.id);

    return {
      id: p.id,
      model_name: p.model_name,
      subtitle: p.subtitle,
      full_name: p.full_name,
      current_version: p.current_version,
      status: p.status || "active",
      has_product_image: hasProductImage,
      has_hardware_image: hasHardwareImage,
      radio_patterns: radioPatterns,
      last_content_changed: latestChange?.edited_at ?? null,
      last_change_by: latestChange?.edited_by ?? null,
      last_change_summary: latestChange?.summary ?? null,
      updated_at: p.updated_at,
      product_line_id: p.product_line_id,
      product_line: p.product_lines,
    };
  });

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <DashboardContent
        productLines={productLines ?? []}
        products={productSummaries}
      />
    </div>
  );
}
