/**
 * Does the model actually respect the Layer-6 length budget?
 *
 * Translates a product's real overview + features into a locale, measures
 * each result against its budget, then runs the translation through the
 * same estimateCoverLayout the red-flag check uses. This is the loop the
 * budget exists to close: prompt says "stay under N", this proves whether
 * it did, and whether staying under N actually saved the cover.
 *
 * Needs an OpenRouter key — API_KEY_ENC_SECRET (to decrypt the shared key
 * from app_settings) or OPENROUTER_API_KEY directly in the environment.
 * Costs one translation call per block.
 *
 * --dry-run needs neither a key nor a call: it prints the system prompt
 * the model would receive, so you can confirm the budget is really in
 * there (it's computed at request time, so reading the prompt files
 * doesn't tell you).
 *
 *   npx tsx scripts/check-translation-budget.ts ECS1552FP es --dry-run
 *   npx tsx scripts/check-translation-budget.ts ECS1552FP es
 *   npx tsx scripts/check-translation-budget.ts ECS1552FP es anthropic/claude-opus-4.8
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { translate, previewSystemPrompt } from "../src/lib/translate";
import { lineParityBudget, estimateCoverLayout } from "../src/lib/datasheet/cover-layout";
config({ path: ".env.local" });

const OVERVIEW_SAFETY_BUFFER_PT = 12; // must match layout-check.ts

async function main() {
  const model = process.argv[2];
  const locale = process.argv[3];
  // Omit to use the catalog default; pass an OpenRouter slug to pin one.
  const provider = process.argv[4];

  if (!model || !locale) {
    console.error("usage: check-translation-budget.ts <MODEL> <locale> [provider]");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data } = await supabase
    .from("products")
    .select("model_name, overview, features, product_lines(name)")
    .eq("model_name", model)
    .single();

  const p = data as {
    model_name: string;
    overview: string | null;
    features: string[] | null;
    product_lines: { name: string } | null;
  } | null;

  if (!p) {
    console.error(`${model} not found`);
    process.exit(1);
  }

  const enOverview = p.overview ?? "";
  const enFeatures = p.features ?? [];
  const productLine = p.product_lines?.name;

  console.log(`${p.model_name} — ${productLine ?? "?"} — en → ${locale} via ${provider ?? "catalog default"}`);
  console.log(`source: overview ${enOverview.length}ch, ${enFeatures.length} features\n`);

  if (process.argv.includes("--dry-run")) {
    for (const [label, contentType, source] of [
      ["FEATURES", "features", enFeatures.join("\n")],
      ["OVERVIEW", "overview", enOverview],
    ] as const) {
      const prompt = await previewSystemPrompt({
        source,
        targetLocale: locale,
        contentType,
        productLine,
      });
      const budgetSection = prompt.slice(prompt.indexOf("## Length Budget"));
      console.log(`═══ ${label} — system prompt is ${prompt.length}ch, budget layer: ═══`);
      console.log(budgetSection || "⚠️  NO BUDGET LAYER PRESENT");
      console.log();
    }
    return;
  }

  const [featRes, ovRes] = await Promise.all([
    translate({
      source: enFeatures.join("\n"),
      targetLocale: locale,
      contentType: "features",
      productLine,
      providerId: provider,
      // Match what the editor records, so script runs and real usage tag
      // the ledger at the same granularity instead of product-line vs model.
      ref: p.model_name,
    }),
    translate({
      source: enOverview,
      targetLocale: locale,
      contentType: "overview",
      productLine,
      providerId: provider,
      // Match what the editor records, so script runs and real usage tag
      // the ledger at the same granularity instead of product-line vs model.
      ref: p.model_name,
    }),
  ]);

  const outFeatures = featRes.translated.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const budgets = lineParityBudget({ texts: enFeatures, block: "features", targetLocale: locale });

  if (outFeatures.length !== enFeatures.length) {
    console.log(`⚠️  arity: got ${outFeatures.length} lines, source had ${enFeatures.length}\n`);
  }

  let over = 0;
  outFeatures.forEach((f, i) => {
    const b = budgets[i];
    if (!b) return;
    const bad = f.length > b.maxChars;
    if (bad) over++;
    console.log(
      `${String(i + 1).padStart(2)}: ${String(f.length).padStart(3)}/${String(b.maxChars).padStart(3)}ch ` +
      `${bad ? "❌" : "✅"}  ${f.slice(0, 60)}`,
    );
  });

  const ovBudget = lineParityBudget({ texts: [enOverview], block: "overview", targetLocale: locale })[0];
  const ovOver = ovRes.translated.length > ovBudget.maxChars;
  if (ovOver) over++;
  console.log(
    `\noverview: ${ovRes.translated.length}/${ovBudget.maxChars}ch ${ovOver ? "❌" : "✅"}`,
  );
  console.log(`over budget: ${over}`);

  const est = estimateCoverLayout({
    overview: ovRes.translated,
    features: outFeatures,
    locale,
  });
  const headroom = est.overviewSpaceAvailable - est.overviewWantedHeight;
  const fits = !est.featuresCapped && headroom > OVERVIEW_SAFETY_BUFFER_PT;

  console.log(`\n── cover (${locale}) ──`);
  console.log(`features  ${est.featuresWantedHeight}pt / cap 320pt      capped=${est.featuresCapped}`);
  console.log(`overview  ${est.overviewWantedHeight}pt / ${est.overviewSpaceAvailable}pt available`);
  console.log(`headroom  ${headroom}pt (needs > ${OVERVIEW_SAFETY_BUFFER_PT}pt)`);
  console.log(`VERDICT   ${fits ? "🟢 fits" : "🔴 overflow"}`);

  console.log(`\n--- features ---\n${outFeatures.join("\n")}`);
  console.log(`\n--- overview ---\n${ovRes.translated}`);
}

main();
