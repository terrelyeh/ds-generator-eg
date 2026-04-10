import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
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

export default async function SolutionDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ solution: string }>;
  searchParams: Promise<{ line?: string }>;
}) {
  const { solution: solutionSlug } = await params;
  const { line: lineSlug } = await searchParams;
  const supabase = createAdminClient();

  // Verify solution exists
  const { data: solutionRows } = await supabase
    .from("solutions")
    .select("id, name, label, slug, color_primary")
    .eq("slug", solutionSlug)
    .limit(1);

  const solution = solutionRows?.[0] as { id: string; name: string; label: string; slug: string; color_primary: string } | undefined;
  if (!solution) notFound();

  // Fetch product lines for this solution only
  const { data: productLines } = (await supabase
    .from("product_lines")
    .select("*")
    .eq("solution_id", solution.id)
    .order("sort_order")) as { data: ProductLine[] | null };

  const productLineIds = (productLines ?? []).map((pl) => pl.id);

  // Fetch products for these product lines
  const { data: products } = productLineIds.length
    ? ((await supabase
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
        .in("product_line_id", productLineIds)
        .order("model_name")) as { data: ProductRow[] | null })
    : { data: [] as ProductRow[] };

  // Fetch radio pattern assets (for AP)
  const productIds = (products ?? []).map((p) => p.id);
  const { data: radioAssets } = productIds.length
    ? ((await supabase
        .from("image_assets")
        .select("product_id, label, status")
        .eq("image_type", "radio_pattern")
        .in("product_id", productIds)) as { data: RadioPatternAsset[] | null })
    : { data: [] as RadioPatternAsset[] };

  // Fetch latest change_log per product (for "Last Changed" column)
  const { data: changeLogs } = productIds.length
    ? ((await supabase
        .from("change_logs")
        .select("product_id, edited_at, edited_by, changes_summary")
        .not("product_id", "is", null)
        .in("product_id", productIds)
        .order("created_at", { ascending: false })) as {
        data: ChangeLogRow[] | null;
      })
    : { data: [] as ChangeLogRow[] };

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

  // Build radio pattern readiness map
  const radioMap = new Map<
    string,
    Map<string, { h_plane: boolean; e_plane: boolean }>
  >();
  if (radioAssets) {
    for (const asset of radioAssets) {
      if (!radioMap.has(asset.product_id))
        radioMap.set(asset.product_id, new Map());
      const bands = radioMap.get(asset.product_id)!;
      const bandMatch = asset.label.match(/^([\d.]+G)\s+(H|E)-plane$/i);
      if (bandMatch) {
        const band = bandMatch[1];
        const plane = bandMatch[2].toLowerCase();
        if (!bands.has(band))
          bands.set(band, { h_plane: false, e_plane: false });
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

    const radioPatterns: {
      band: string;
      h_plane: boolean;
      e_plane: boolean;
    }[] = [];
    const bands = radioMap.get(p.id);
    if (bands) {
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

  // Resolve ?line= slug to product line ID
  const initialLineId = lineSlug
    ? (productLines ?? []).find(
        (pl) => pl.name.toLowerCase().replace(/\s+/g, "-") === lineSlug
      )?.id
    : undefined;

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <DashboardContent
        productLines={productLines ?? []}
        products={productSummaries}
        initialLineId={initialLineId}
      />
    </div>
  );
}
