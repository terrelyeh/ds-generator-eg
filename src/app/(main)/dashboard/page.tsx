import { createClient } from "@/lib/supabase/server";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import type { ProductLine } from "@/types/database";

interface ProductRow {
  id: string;
  model_name: string;
  subtitle: string;
  full_name: string;
  current_version: string;
  product_image: string;
  hardware_image: string;
  sheet_last_modified: string | null;
  sheet_last_editor: string | null;
  updated_at: string;
  product_line_id: string;
  product_lines: { name: string; label: string; category: string };
}

interface RadioPatternAsset {
  product_id: string;
  label: string;
  status: string;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: productLines } = (await supabase
    .from("product_lines")
    .select("*")
    .order("name")) as { data: ProductLine[] | null };

  const { data: products } = (await supabase
    .from("products")
    .select(
      `
      id,
      model_name,
      subtitle,
      full_name,
      current_version,
      product_image,
      hardware_image,
      sheet_last_modified,
      sheet_last_editor,
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

    return {
      id: p.id,
      model_name: p.model_name,
      subtitle: p.subtitle,
      full_name: p.full_name,
      current_version: p.current_version,
      has_product_image: hasProductImage,
      has_hardware_image: hasHardwareImage,
      radio_patterns: radioPatterns,
      sheet_last_modified: p.sheet_last_modified,
      sheet_last_editor: p.sheet_last_editor,
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
