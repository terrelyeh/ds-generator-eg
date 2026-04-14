import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/taxonomy
 *
 * Returns the EnGenius product taxonomy (Solution > Product Line > Model)
 * for populating the Knowledge Base taxonomy dropdowns.
 *
 * Response shape:
 * {
 *   solutions: [{ slug, label, sort_order }],
 *   product_lines: [{ name, label, solution_id, solution_slug }],
 *   products: [{ model_name, product_line_id, product_line_name }]
 * }
 */
export async function GET() {
  const supabase = createAdminClient();

  const [solutionsRes, productLinesRes, productsRes] = await Promise.all([
    supabase
      .from("solutions")
      .select("id, slug, label, sort_order")
      .order("sort_order"),
    supabase
      .from("product_lines")
      .select("id, name, label, solution_id, category")
      .order("name"),
    supabase
      .from("products")
      .select("model_name, product_line_id, status")
      .order("model_name"),
  ]);

  if (solutionsRes.error || productLinesRes.error || productsRes.error) {
    return NextResponse.json(
      { error: "Failed to load taxonomy" },
      { status: 500 }
    );
  }

  const solutions = solutionsRes.data ?? [];
  const productLines = productLinesRes.data ?? [];
  const products = productsRes.data ?? [];

  // Build slug lookup map for denormalizing solution onto product_lines
  const solutionSlugById = new Map(solutions.map((s) => [s.id, s.slug]));
  const productLineNameById = new Map(productLines.map((pl) => [pl.id, pl.name]));

  return NextResponse.json({
    ok: true,
    solutions: solutions.map((s) => ({
      slug: s.slug,
      label: s.label,
      sort_order: s.sort_order,
    })),
    product_lines: productLines.map((pl) => ({
      name: pl.name,
      label: pl.label,
      category: pl.category,
      solution_slug: solutionSlugById.get(pl.solution_id) ?? null,
    })),
    products: products.map((p) => ({
      model_name: p.model_name,
      product_line_name: productLineNameById.get(p.product_line_id) ?? null,
      status: p.status,
    })),
  });
}
