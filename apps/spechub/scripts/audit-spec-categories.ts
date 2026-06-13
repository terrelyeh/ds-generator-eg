/**
 * Audit: list every spec section category currently in Supabase, grouped
 * by product line. Flags products that only have a single "General"
 * category (likely parser-missed categories).
 *
 * Run: npx tsx scripts/audit-spec-categories.ts
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: lines } = await supabase
    .from("product_lines")
    .select("id, name, label")
    .order("sort_order");

  const { data: products } = await supabase
    .from("products")
    .select("id, model_name, product_line_id, status")
    .eq("status", "active");

  const { data: specRows } = await supabase
    .from("spec_sections")
    .select("id, product_id, category, sort_order");

  const lineMap = new Map((lines ?? []).map((l: any) => [l.id, l.label]));
  const productMap = new Map(
    (products ?? []).map((p: any) => [p.id, { model: p.model_name, line: lineMap.get(p.product_line_id) ?? "?" }]),
  );

  // Build: product_id -> categories list
  const productCategories = new Map<string, string[]>();
  for (const row of (specRows ?? []) as Array<{ product_id: string; category: string; sort_order: number }>) {
    if (!productCategories.has(row.product_id)) productCategories.set(row.product_id, []);
    productCategories.get(row.product_id)!.push(row.category);
  }

  // Group by product line
  const byLine = new Map<string, { model: string; categories: string[] }[]>();
  for (const [pid, info] of productMap) {
    const cats = productCategories.get(pid) ?? [];
    if (!byLine.has(info.line)) byLine.set(info.line, []);
    byLine.get(info.line)!.push({ model: info.model, categories: cats });
  }

  for (const [line, prods] of byLine) {
    console.log(`\n━━━ ${line} (${prods.length} products) ━━━`);

    // Aggregate unique categories
    const uniqueCategories = new Set<string>();
    const categoryCounts = new Map<string, number>();
    for (const p of prods) {
      for (const c of p.categories) {
        uniqueCategories.add(c);
        categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);
      }
    }

    // Flag suspicious products
    const singleGeneral = prods.filter(
      (p) => p.categories.length === 1 && p.categories[0] === "General",
    );
    const zeroSections = prods.filter((p) => p.categories.length === 0);

    console.log(`  Unique categories across this line: ${uniqueCategories.size}`);
    const sortedCats = Array.from(categoryCounts.entries()).sort((a, b) => b[1] - a[1]);
    for (const [cat, count] of sortedCats) {
      const pct = Math.round((count / prods.length) * 100);
      console.log(`    "${cat}"  (${count}/${prods.length} products, ${pct}%)`);
    }

    if (singleGeneral.length > 0) {
      console.log(`  ⚠  ${singleGeneral.length} products with ONLY "General" category (parser likely missed all headers):`);
      console.log(`     ${singleGeneral.slice(0, 5).map((p) => p.model).join(", ")}${singleGeneral.length > 5 ? ` +${singleGeneral.length - 5} more` : ""}`);
    }

    if (zeroSections.length > 0) {
      console.log(`  ⚠  ${zeroSections.length} products with NO spec sections at all:`);
      console.log(`     ${zeroSections.slice(0, 5).map((p) => p.model).join(", ")}${zeroSections.length > 5 ? ` +${zeroSections.length - 5} more` : ""}`);
    }

    // Products with few (< 4) categories — maybe partial miss
    const fewCategories = prods.filter((p) => p.categories.length > 0 && p.categories.length < 4);
    if (fewCategories.length > 0 && fewCategories.length !== singleGeneral.length) {
      console.log(`  ℹ  ${fewCategories.length} products with < 4 categories (may have partial miss):`);
      for (const p of fewCategories.slice(0, 5)) {
        console.log(`     ${p.model}: [${p.categories.join(", ")}]`);
      }
      if (fewCategories.length > 5) console.log(`     +${fewCategories.length - 5} more`);
    }
  }

  // Summary
  console.log(`\n━━━ Summary ━━━`);
  const totalProducts = productMap.size;
  const totalWithSpecs = Array.from(productCategories.values()).filter((c) => c.length > 0).length;
  const totalSingleGeneral = Array.from(productCategories.values()).filter(
    (c) => c.length === 1 && c[0] === "General",
  ).length;
  console.log(`  Total active products: ${totalProducts}`);
  console.log(`  With any spec section:  ${totalWithSpecs}`);
  console.log(`  Only "General":         ${totalSingleGeneral} (suspected parser miss)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
