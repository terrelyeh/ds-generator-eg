/**
 * Page count for every product, so a change to the packer can be measured
 * against the whole catalogue instead of guessed at.
 *
 * Run it on the fix and on the code before it, then diff the two outputs.
 * A layout change that moves one datasheet is worth making; the same change
 * that moves forty is worth understanding first — an over-conservative
 * threshold once pushed 20+ datasheets onto an extra page to rescue two.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  CATEGORY_HEADER_HEIGHT,
  HARD_COLUMN_LIMIT,
  SECTION_GAP,
  estimateRowHeight,
  splitIntoPages,
  type Section,
} from "../src/lib/datasheet/pagination";

/** What the column is worth once rendered, gaps included. */
function columnHeight(col: Section[], locale?: string): number {
  const content = col.reduce(
    (h, s) =>
      h +
      (s.isContinuation ? 0 : CATEGORY_HEADER_HEIGHT) +
      s.items.reduce((a, i) => a + estimateRowHeight(i, locale), 0),
    0,
  );
  return content + Math.max(0, col.length - 1) * SECTION_GAP;
}
config({ path: ".env.local" });

type Item = { label: string; value: string; sort_order: number };
type Row = { product_id: string; category: string; sort_order: number; spec_items: Item[] | null };

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: products } = (await supabase
    .from("products")
    .select("id, model_name, current_versions")
    .order("model_name")) as {
    data: { id: string; model_name: string; current_versions: Record<string, string> | null }[] | null;
  };

  const { data: rows } = (await supabase
    .from("spec_sections")
    .select("product_id, category, sort_order, spec_items (label, value, sort_order)")
    .order("sort_order")) as { data: Row[] | null };

  const byProduct = new Map<string, Row[]>();
  for (const r of rows ?? []) {
    if (!byProduct.has(r.product_id)) byProduct.set(r.product_id, []);
    byProduct.get(r.product_id)!.push(r);
  }

  const out: string[] = [];
  for (const p of products ?? []) {
    const sections = (byProduct.get(p.id) ?? []).map((s) => ({
      category: s.category,
      items: (s.spec_items ?? [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((i) => ({ label: i.label, value: i.value })),
    }));
    if (sections.length === 0) continue;

    // Every locale a PDF has actually been generated for — row metrics differ
    // per locale, so en can be unaffected while ja moves.
    const locales = ["en", ...Object.keys(p.current_versions ?? {}).filter((l) => l !== "en")];
    for (const locale of locales) {
      const loc = locale === "en" ? undefined : locale;
      const pages = splitIntoPages(sections, loc);
      let worst = 0;
      for (const pg of pages) {
        worst = Math.max(worst, columnHeight(pg.left, loc), columnHeight(pg.right, loc));
      }
      const over = worst > HARD_COLUMN_LIMIT ? `  OVER by ${worst - HARD_COLUMN_LIMIT}pt` : "";
      out.push(`${p.model_name}\t${locale}\t${pages.length}\t${worst}${over}`);
    }
  }
  console.log(out.join("\n"));
}

main();
