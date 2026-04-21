/**
 * Verify strikethrough filtering by fetching ECS1008P's Package Contents
 * (user's screenshot showed "1x Ground Screw Set" with strikethrough).
 * Expected: output should NOT contain "Ground Screw Set".
 */
import { config } from "dotenv";
import { loadProductFromSheets } from "../src/lib/google/sheets";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

async function main() {
  const model = process.argv[2] || "ECS1008P";
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: p } = await supabase
    .from("products")
    .select("id, model_name, product_line_id")
    .eq("model_name", model)
    .single() as { data: { id: string; model_name: string; product_line_id: string } | null };

  if (!p) {
    console.log(`Model ${model} not found`);
    return;
  }

  const { data: pl } = await supabase
    .from("product_lines")
    .select("sheet_id, detail_specs_gid, overview_gid, name")
    .eq("id", p.product_line_id)
    .single() as { data: { sheet_id: string; detail_specs_gid: string; overview_gid: string; name: string } | null };

  if (!pl) return;

  console.log(`\nFetching ${model} from ${pl.name} sheet...\n`);

  const product = await loadProductFromSheets(
    pl.sheet_id,
    pl.detail_specs_gid,
    pl.overview_gid,
    model,
  );

  if (!product) {
    console.log("No data");
    return;
  }

  console.log(`Model: ${product.model_name}`);
  console.log(`Subtitle: ${product.subtitle}`);
  console.log(`Overview: ${product.overview?.slice(0, 100)}...\n`);
  console.log(`Features (${product.features?.length ?? 0}):`);
  (product.features ?? []).forEach((f, i) => console.log(`  ${i + 1}. ${f}`));

  console.log(`\nSpec sections (${product.spec_sections.length}):`);
  for (const sec of product.spec_sections) {
    console.log(`\n  [${sec.category}] (${sec.items.length} items)`);
    for (const it of sec.items) {
      // Highlight items likely containing strikethrough-filtered content
      const value = it.value;
      const preview = value.length > 80 ? value.slice(0, 80) + "..." : value;
      console.log(`    ${it.label}: ${preview.replace(/\n/g, " | ")}`);
    }
  }

  // Search for likely strikethrough leftover markers
  const allText = JSON.stringify(product);
  const suspicious = ["Ground Screw Set"];
  for (const s of suspicious) {
    if (allText.includes(s)) {
      console.log(`\n🔴 STILL CONTAINS: "${s}"`);
    } else {
      console.log(`\n✅ Not found: "${s}" (strikethrough filtered correctly)`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
