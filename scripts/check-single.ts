import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { checkProductLayout } from "../src/lib/datasheet/layout-check";
import { estimateCoverLayout } from "../src/lib/datasheet/cover-layout";
config({ path: ".env.local" });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const model = process.argv[2] || "ECW201L-AC";

  const { data: products } = await supabase
    .from("products")
    .select("id, model_name, overview, features")
    .eq("model_name", model);

  const p = (products?.[0] ?? null) as {
    id: string; model_name: string; overview: string | null; features: string[] | null;
  } | null;
  if (!p) { console.log("not found"); return; }

  console.log(`\nModel: ${p.model_name}`);
  console.log(`Overview: ${p.overview?.length ?? 0} chars`);
  console.log(`Features: ${p.features?.length ?? 0} items`);
  if (p.features) {
    p.features.forEach((f, i) => console.log(`  [${i + 1}] (${f.length} chars) ${f.slice(0, 60)}${f.length > 60 ? "..." : ""}`));
  }

  const layout = estimateCoverLayout({ overview: p.overview, features: p.features });
  console.log(`\nLayout estimate:`);
  console.log(`  Features total lines: ${layout.featuresTotalLines} (per col: ${layout.featuresPerColLines})`);
  console.log(`  Features wanted: ${layout.featuresWantedHeight}pt → actual: ${layout.featuresHeight}pt  (capped: ${layout.featuresCapped})`);
  console.log(`  Overview lines: ${layout.overviewLines}`);
  console.log(`  Overview wanted: ${layout.overviewWantedHeight}pt / available: ${layout.overviewSpaceAvailable}pt  (overflow: ${layout.overviewOverflow})`);
  console.log(`  → willOverflow: ${layout.willOverflow}`);

  const { data: specRows } = await supabase
    .from("spec_sections")
    .select("id, product_id, category, sort_order, spec_items (label, value, sort_order)")
    .eq("product_id", p.id);

  const sections = (specRows ?? []).map((s: any) => ({
    category: s.category,
    items: (s.spec_items ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order).map((it: any) => ({ label: it.label, value: it.value })),
  }));

  const report = checkProductLayout({
    overview: p.overview,
    features: p.features,
    spec_sections: sections,
  });

  console.log(`\nLayout report:`);
  console.log(`  Overall: ${report.status}`);
  console.log(`  Cover overall: ${report.cover.status}`);
  console.log(`  Overview: ${report.cover.overview_status}`);
  console.log(`  Features: ${report.cover.features_status}`);
  console.log(`  Spec: ${report.spec.status}`);
  console.log(`\n  Reasons:`);
  [...report.cover.reasons, ...report.spec.reasons].forEach(r => console.log(`    - ${r}`));
}

main().catch(e => { console.error(e); process.exit(1); });
