/**
 * Check how the dynamic cover layout allocates space for a model in
 * different locales. Shows the actual pt numbers so we can see whether
 * features shrinks / overview grows as expected.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { estimateCoverLayout } from "../src/lib/datasheet/cover-layout";
config({ path: ".env.local" });

async function main() {
  const model = process.argv[2] || "ECC100";
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: p } = await supabase
    .from("products")
    .select("id, model_name, overview, features")
    .eq("model_name", model)
    .single() as { data: { id: string; model_name: string; overview: string; features: string[] } | null };

  if (!p) { console.log("not found"); return; }

  const { data: translations } = await supabase
    .from("product_translations" as "products")
    .select("locale, overview, features")
    .eq("product_id", model) as {
      data: { locale: string; overview: string | null; features: string[] | null }[] | null;
    };

  const scenarios: { tag: string; locale: string | undefined; overview: string; features: string[] }[] = [
    { tag: "EN (English)", locale: undefined, overview: p.overview, features: p.features },
  ];
  for (const t of translations ?? []) {
    scenarios.push({
      tag: t.locale,
      locale: t.locale,
      overview: t.overview ?? p.overview,
      features: (t.features ?? p.features) as string[],
    });
  }

  console.log(`\nModel: ${model}\n`);
  for (const s of scenarios) {
    const r = estimateCoverLayout({ overview: s.overview, features: s.features, locale: s.locale });
    const ovLen = s.overview.length;
    console.log(`━━━ ${s.tag} ━━━`);
    console.log(`  Overview: ${ovLen} chars → ${r.overviewLines} lines × lh → ${r.overviewWantedHeight}pt wanted`);
    console.log(`  Features: ${s.features.length} items, ${r.featuresTotalLines} total lines → ${r.featuresWantedHeight}pt wanted → ${r.featuresHeight}pt actual${r.featuresCapped ? " (CAPPED)" : ""}`);
    const gap = r.overviewSpaceAvailable + r.featuresHeight < 486
      ? 486 - r.overviewSpaceAvailable - r.featuresHeight
      : 20;
    console.log(`  ┌─ Allocated cover zone (486pt total) ─┐`);
    console.log(`  │  Overview box:  ${r.overviewSpaceAvailable}pt  (available)  [needs ${r.overviewWantedHeight}pt]`);
    console.log(`  │  Gap:           ${gap}pt`);
    console.log(`  │  Features box:  ${r.featuresHeight}pt`);
    console.log(`  └──────────────────────────────────────┘`);
    console.log(`  Overview OK: ${!r.overviewOverflow ? "✅" : "❌ overflow by " + (r.overviewWantedHeight - r.overviewSpaceAvailable) + "pt"}`);
    console.log();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
