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
  sheet_last_modified: string | null;
  sheet_last_editor: string | null;
  updated_at: string;
  product_line_id: string;
  product_lines: { name: string; label: string; category: string };
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: productLines } = await supabase
    .from("product_lines")
    .select("*")
    .order("name") as { data: ProductLine[] | null };

  const { data: products } = await supabase
    .from("products")
    .select(
      `
      id,
      model_name,
      subtitle,
      full_name,
      current_version,
      product_image,
      sheet_last_modified,
      sheet_last_editor,
      updated_at,
      product_line_id,
      product_lines (name, label, category)
    `
    )
    .order("model_name") as { data: ProductRow[] | null };

  const { data: imageAssets } = await supabase
    .from("image_assets")
    .select("product_id, status") as {
    data: { product_id: string; status: string }[] | null;
  };

  // Compute image readiness per product
  const imageReadiness = new Map<
    string,
    { total: number; ready: number }
  >();
  if (imageAssets) {
    for (const asset of imageAssets) {
      const entry = imageReadiness.get(asset.product_id) ?? {
        total: 0,
        ready: 0,
      };
      entry.total++;
      if (asset.status !== "missing") entry.ready++;
      imageReadiness.set(asset.product_id, entry);
    }
  }

  const productSummaries = (products ?? []).map((p) => ({
    id: p.id,
    model_name: p.model_name,
    subtitle: p.subtitle,
    full_name: p.full_name,
    current_version: p.current_version,
    product_image: p.product_image,
    sheet_last_modified: p.sheet_last_modified,
    sheet_last_editor: p.sheet_last_editor,
    updated_at: p.updated_at,
    product_line_id: p.product_line_id,
    product_line: p.product_lines,
    image_readiness: imageReadiness.get(p.id) ?? { total: 0, ready: 0 },
  }));

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">
          Product Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage datasheets across all product lines
        </p>
      </div>
      <DashboardContent
        productLines={productLines ?? []}
        products={productSummaries}
      />
    </div>
  );
}
