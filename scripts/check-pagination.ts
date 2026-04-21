import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { splitIntoPages, estimateItemHeight, AVAILABLE_HEIGHT, CATEGORY_HEADER_HEIGHT } from "../src/lib/datasheet/pagination";
config({ path: ".env.local" });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const model = process.argv[2] || "ECS1528P";

  const { data: p } = await supabase
    .from("products").select("id, model_name").eq("model_name", model).single() as { data: { id: string; model_name: string } | null };
  if (!p) { console.log("not found"); return; }

  const { data: specRows } = await supabase
    .from("spec_sections")
    .select("id, category, sort_order, spec_items (label, value, sort_order)")
    .eq("product_id", p.id)
    .order("sort_order");

  const sections = (specRows ?? []).map((s: any) => ({
    category: s.category,
    items: (s.spec_items ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order).map((it: any) => ({ label: it.label, value: it.value })),
  }));

  const pages = splitIntoPages(sections);

  console.log(`\nModel: ${p.model_name}`);
  console.log(`AVAILABLE_HEIGHT per column: ${AVAILABLE_HEIGHT}pt`);
  console.log(`Pages: ${pages.length}\n`);

  pages.forEach((page, pi) => {
    console.log(`─── Page ${pi + 1} ───`);
    (["left", "right"] as const).forEach((col) => {
      let colH = 0;
      console.log(`  ${col.toUpperCase()}:`);
      for (const sec of page[col]) {
        if (!sec.isContinuation) colH += CATEGORY_HEADER_HEIGHT;
        const hdr = sec.isContinuation ? "[no header]" : `"${sec.category}"`;
        console.log(`    ${hdr}  (${sec.items.length} items)`);
        for (const it of sec.items) {
          const itH = estimateItemHeight(it.value);
          colH += itH;
          const previewValue = it.value.length > 35 ? it.value.replace(/\n/g, "⏎").slice(0, 35) + "…" : it.value.replace(/\n/g, "⏎");
          console.log(`      • [${itH}pt] ${it.label}: ${previewValue}`);
        }
      }
      const pct = Math.round((colH / AVAILABLE_HEIGHT) * 100);
      const unused = AVAILABLE_HEIGHT - colH;
      console.log(`    === Column total: ${colH}pt / ${AVAILABLE_HEIGHT}pt (${pct}%, ${unused}pt unused) ===\n`);
    });
  });
}
main().catch(e => { console.error(e); process.exit(1); });
