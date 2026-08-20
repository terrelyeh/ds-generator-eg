import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate } from "@eg/auth/session";
import { normalizeKey } from "@/lib/project-datasheet/resolve";
import type { ModelImage, RawSpecRow } from "@/lib/project-datasheet/types";
import type { Product, SpecItem, SpecSection } from "@eg/db/types";

/**
 * POST /api/projects/[id]/seed-from-product { productModel, asModelName? }
 *
 * Start a column from a model we already ship.
 *
 * The public datasheet is written for buyers and leaves out the deep
 * technical rows a tender scores on, so the workflow is "take the real one
 * and add what it doesn't say". Copying the specs beats retyping forty rows,
 * and — because they land in `raw_doc` — every later edit shows up in the gap
 * review as a deviation from what we publish.
 *
 * GET lists candidate products for the picker.
 *
 * ⚠️ Catalogue → project only. There is no route back, and there never will
 * be: a quote must not be able to become a product record (see 00038).
 * This reads `products` and writes nothing to it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await gate("project_datasheet.view");
  if (denied) return denied;
  await params;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("products")
    .select("model_name, full_name, subtitle, status, product_lines (name, label, category)")
    .order("model_name");

  const products = ((data ?? []) as unknown as (Product & {
    product_lines: { name: string; label: string; category: string } | null;
  })[]).map((p) => ({
    model: p.model_name,
    name: p.full_name || p.subtitle || "",
    line: p.product_lines?.label ?? p.product_lines?.name ?? "",
    category: p.product_lines?.category ?? "",
    status: p.status,
  }));

  return NextResponse.json({ products });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await gate("project_datasheet.edit");
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    productModel?: string;
    asModelName?: string;
  };
  const productModel = body.productModel?.trim();
  if (!productModel) {
    return NextResponse.json({ error: "productModel is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: productRow } = await supabase
    .from("products")
    .select("*, spec_sections (*, spec_items (*)), image_assets (*)")
    .eq("model_name", productModel)
    .maybeSingle();

  const product = productRow as unknown as
    | (Product & {
        spec_sections: (SpecSection & { spec_items: SpecItem[] })[];
        image_assets: { image_type: string; label: string; file_url: string | null }[];
      })
    | null;
  if (!product) return NextResponse.json({ error: "product not found" }, { status: 404 });

  // Flatten the catalogue's section/item tree. The section name rides along
  // in the label prefix ONLY where it disambiguates — a project spec table is
  // one flat matrix, and "Physical Interfaces › Ethernet" reads worse than
  // "Ethernet" for the 90% of labels that are already unique.
  const labelCounts = new Map<string, number>();
  for (const section of product.spec_sections ?? []) {
    for (const item of section.spec_items ?? []) {
      labelCounts.set(item.label, (labelCounts.get(item.label) ?? 0) + 1);
    }
  }

  const rows: RawSpecRow[] = [];
  const sections = [...(product.spec_sections ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  for (const section of sections) {
    const items = [...(section.spec_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    for (const item of items) {
      const label =
        (labelCounts.get(item.label) ?? 0) > 1 ? `${section.category} — ${item.label}` : item.label;
      rows.push({
        key: normalizeKey(label),
        label,
        value: item.value,
        group: "spec",
        source_page: null,
        // Not a guess — this is our own published value, read from our own
        // database. Nothing was inferred.
        confidence: 1,
      });
    }
  }

  const images: ModelImage[] = (product.image_assets ?? [])
    .filter((a) => a.file_url)
    .map((a) => ({
      slot: a.image_type === "product" ? "product" : a.label || a.image_type,
      url: a.file_url as string,
    }));
  if (product.product_image && !images.some((i) => i.slot === "product")) {
    images.unshift({ slot: "product", url: product.product_image });
  }

  const modelName = body.asModelName?.trim() || product.model_name;

  const { count } = await supabase
    .from("project_datasheet_models")
    .select("id", { count: "exact", head: true })
    .eq("project_datasheet_id", id);

  // The source row is what makes the gap review able to tell this column came
  // from a shipping product rather than an ODM sheet — which flips two of its
  // checks (see migration 00042).
  const { data: source, error: sourceError } = await supabase
    .from("project_datasheet_sources")
    .insert({
      project_datasheet_id: id,
      kind: "catalog",
      filename: `${product.model_name} (SpecHub)`,
      extracted_text: [
        product.headline,
        product.overview,
        ...(Array.isArray(product.features) ? product.features : []),
        ...rows.map((r) => `${r.label}: ${r.value}`),
      ]
        .filter(Boolean)
        .join("\n"),
      extraction: { rows, notes: `Seeded from catalogue model ${product.model_name}` } as never,
      extraction_model: null,
      extracted_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (sourceError) {
    return NextResponse.json({ error: sourceError.message }, { status: 500 });
  }

  const { data: created, error } = await supabase
    .from("project_datasheet_models")
    .insert({
      project_datasheet_id: id,
      source_id: source.id,
      position: count ?? 0,
      model_name: modelName,
      display_name: product.full_name || product.subtitle || null,
      overview: product.overview || null,
      features: (Array.isArray(product.features) ? product.features : []) as never,
      images: images as never,
      raw_doc: rows as never,
      rules: {} as never,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: created.id, rows: rows.length, images: images.length });
}
