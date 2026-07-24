import { notFound } from "next/navigation";
import { createClient } from "@eg/db/server";
import { BroadbandPreview, type LineContent } from "../../[model]/broadband-preview";
import {
  EdgeAiSeriesPreview,
  type OrinSeriesContent,
} from "./edge-ai-series-preview";
import type { Product, ProductLine, SpecSection, SpecItem, ImageAsset } from "@eg/db/types";

/**
 * SERIES-scope datasheet — one document covering an entire product line.
 *
 * Lines opt in via `product_lines.ds_scope`:
 *   'series' — series datasheet only (Edge AI Box ▸ Orin Box)
 *   'both'   — series datasheet AND per-model ones (Broadband EOC)
 *
 * Shared pages come from `line_datasheets`, exactly the same rows the
 * per-model datasheets read, so the two can't drift apart. The category
 * picks the layout component — every scope-aware line loads its content
 * here, then renders through its own visual variant.
 */

interface SeriesProduct extends Product {
  spec_sections: (SpecSection & { spec_items: SpecItem[] })[];
  image_assets: ImageAsset[];
}

const BROADBAND_CATEGORIES = new Set(["Broadband APs"]);
const EDGE_AI_CATEGORIES = new Set(["Edge AI Computers"]);

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

  // ── Edge AI Box ▸ Orin Box — teal 5-page layout ────────────────────
  if (EDGE_AI_CATEGORIES.has(line.category)) {
    const [{ data: ldRow }, { data: prodRows }] = await Promise.all([
      supabase
        .from("line_datasheets")
        .select(
          "headline, series_name, category_label, overview, features, software_arch, specs, images, current_version",
        )
        .eq("product_line_id", line.id)
        .maybeSingle(),
      supabase
        .from("products")
        .select("model_name, product_image")
        .eq("product_line_id", line.id),
    ]);
    if (!ldRow) notFound();
    const productImages = new Map(
      ((prodRows ?? []) as { model_name: string; product_image: string | null }[]).map(
        (p) => [p.model_name, p.product_image],
      ),
    );
    return (
      <EdgeAiSeriesPreview
        line={line}
        content={ldRow as unknown as OrinSeriesContent}
        productImages={productImages}
        showToolbar={showToolbar}
        userRole={userRole}
        versionOverride={versionOverride ?? null}
      />
    );
  }

  // ── Broadband Outdoor ▸ EOC — steel-blue layout ────────────────────
  if (BROADBAND_CATEGORIES.has(line.category)) {
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

  notFound();
}
