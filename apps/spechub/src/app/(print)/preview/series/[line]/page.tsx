import { notFound } from "next/navigation";
import { createClient } from "@eg/db/server";
import { BroadbandPreview, type LineContent } from "../../[model]/broadband-preview";
import type { Product, ProductLine, SpecSection, SpecItem, ImageAsset } from "@eg/db/types";

/**
 * SERIES-scope datasheet — one document covering an entire product line.
 *
 * Lines opt in via `product_lines.ds_scope`:
 *   'series' — series datasheet only
 *   'both'   — series datasheet AND per-model ones (Broadband EOC)
 *
 * Shared pages come from `line_datasheets`, exactly the same rows the
 * per-model datasheets read, so the two can't drift apart.
 */

interface SeriesProduct extends Product {
  spec_sections: (SpecSection & { spec_items: SpecItem[] })[];
  image_assets: ImageAsset[];
}

/** Categories whose series datasheet uses the steel-blue Broadband layout. */
const BROADBAND_CATEGORIES = new Set(["Broadband APs"]);

export default async function SeriesPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ line: string }>;
  searchParams: Promise<{ toolbar?: string; version?: string }>;
}) {
  const { line: lineParam } = await params;
  const lineName = decodeURIComponent(lineParam);
  const { toolbar, version: versionOverride } = await searchParams;
  const showToolbar = toolbar !== "false";

  const supabase = await createClient();

  const { getCurrentUser } = await import("@eg/auth/session");
  const currentUser = await getCurrentUser();
  const userRole = currentUser?.role ?? null;

  const { data: plData } = await supabase
    .from("product_lines")
    .select("*")
    .eq("name", lineName)
    .single();
  const line = plData as ProductLine | null;
  if (!line) notFound();

  const scope = (line as ProductLine & { ds_scope?: string }).ds_scope;
  if (scope !== "series" && scope !== "both") notFound();

  // Other series-scope lines (Edge AI Box ▸ Orin Box) have their own layout.
  if (!BROADBAND_CATEGORIES.has(line.category)) notFound();

  const [{ data: ldRow }, { data: prodRows }] = await Promise.all([
    supabase
      .from("line_datasheets")
      .select(
        "headline, series_name, category_label, features, benefits, footnote, current_version",
      )
      .eq("product_line_id", line.id)
      .maybeSingle(),
    supabase
      .from("products")
      .select("*, spec_sections (*, spec_items (*)), image_assets (*)")
      .eq("product_line_id", line.id)
      .order("model_name"),
  ]);

  const products = (prodRows ?? []) as unknown as SeriesProduct[];
  if (products.length === 0) notFound();

  return (
    <BroadbandPreview
      scope="series"
      line={line}
      lineContent={(ldRow as unknown as LineContent) ?? null}
      products={products}
      focusModel={null}
      showToolbar={showToolbar}
      userRole={userRole}
      versionOverride={versionOverride ?? null}
    />
  );
}
