/**
 * Validate layout-check + pagination against real production data.
 * Picks the heaviest-content products per product line and reports:
 * - Overview / Features / Spec layout status (green = ok, red = overflow)
 * - Estimated page count
 * - Longest spec value and its wrap estimate
 * - Preview URL for manual visual verification
 *
 * Run: npx tsx scripts/validate-layout.ts
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { checkProductLayout } from "../src/lib/datasheet/layout-check";
import { splitIntoPages, estimateItemHeight } from "../src/lib/datasheet/pagination";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PICKS_PER_LINE = 3;
const PREVIEW_BASE = "https://ds-generator-eg.vercel.app/preview";

type Section = { category: string; items: { label: string; value: string }[] };

async function main() {
  // Fetch all product lines (+ solution slug for grouping)
  const { data: lines } = await supabase
    .from("product_lines")
    .select("id, name, label, solution_id, solutions(slug)")
    .order("sort_order");

  if (!lines?.length) {
    console.error("No product lines found");
    return;
  }

  console.log(`\nFound ${lines.length} product lines\n`);

  for (const line of lines as unknown as Array<{
    id: string;
    name: string;
    label: string;
    solutions: { slug: string } | null;
  }>) {
    // Fetch products + spec sections for this line
    const { data: products } = await supabase
      .from("products")
      .select("id, model_name, full_name, overview, features, status")
      .eq("product_line_id", line.id)
      .eq("status", "active");

    if (!products?.length) continue;

    const productIds = products.map((p) => p.id);

    const { data: specRows } = await supabase
      .from("spec_sections")
      .select(
        "id, product_id, category, sort_order, spec_items (label, value, sort_order)",
      )
      .in("product_id", productIds);

    // Build spec map
    const specMap = new Map<string, Section[]>();
    for (const sec of (specRows ?? []) as Array<{
      product_id: string;
      category: string;
      sort_order: number;
      spec_items: { label: string; value: string; sort_order: number }[];
    }>) {
      if (!specMap.has(sec.product_id)) specMap.set(sec.product_id, []);
      specMap.get(sec.product_id)!.push({
        category: sec.category,
        items: (sec.spec_items ?? [])
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((it) => ({ label: it.label, value: it.value })),
      });
    }

    // Score each product by total content volume
    const scored = products.map((p) => {
      const sections = specMap.get(p.id) ?? [];
      const specChars = sections.reduce(
        (s, sec) => s + sec.items.reduce((ss, it) => ss + it.value.length, 0),
        0,
      );
      const featureChars = ((p.features as string[]) ?? []).reduce(
        (s, f) => s + f.length,
        0,
      );
      const volume = (p.overview?.length ?? 0) + featureChars + specChars;
      return { ...p, sections, volume };
    });

    scored.sort((a, b) => b.volume - a.volume);
    const picks = scored.slice(0, PICKS_PER_LINE);

    console.log(`━━━ ${line.label} (${line.name}) ━━━`);

    for (const p of picks) {
      const report = checkProductLayout({
        overview: p.overview,
        features: p.features as string[] | null,
        spec_sections: p.sections,
      });

      const pages = splitIntoPages(p.sections);
      const totalItems = p.sections.reduce((s, x) => s + x.items.length, 0);

      const allItems = p.sections.flatMap((s) =>
        s.items.map((it) => ({ section: s.category, ...it })),
      );
      const longest = allItems
        .map((it) => ({
          ...it,
          h: estimateItemHeight(it.value),
          chars: it.value.length,
        }))
        .sort((a, b) => b.chars - a.chars)[0];

      const flag = (s: string) => (s === "overflow" ? "🔴" : s === "ok" ? "🟢" : "🟡");

      console.log(`\n  ${p.model_name}  (${totalItems} spec items, ${pages.length} page${pages.length > 1 ? "s" : ""})`);
      console.log(
        `    OV ${flag(report.cover.overview_status)} (${p.overview?.length ?? 0} chars) | FT ${flag(report.cover.features_status)} (${((p.features as string[]) ?? []).length} items) | SP ${flag(report.spec.status)}`,
      );
      if (longest) {
        console.log(
          `    Longest spec: "${longest.label}" = ${longest.chars} chars (~${Math.round((longest.h - 20) / 10) + 1} lines, ${longest.h}pt)`,
        );
      }
      if (report.cover.reasons.length || report.spec.reasons.length) {
        [...report.cover.reasons, ...report.spec.reasons].forEach((r) =>
          console.log(`    ⚠ ${r}`),
        );
      }
      console.log(`    ${PREVIEW_BASE}/${p.model_name}`);
    }
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
