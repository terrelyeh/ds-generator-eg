import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { splitIntoPages } from "../src/lib/datasheet/pagination";
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
  console.log(`Pages: ${pages.length}`);
  pages.forEach((page, pi) => {
    console.log(`\n─── Page ${pi + 1} ───`);
    (["left", "right"] as const).forEach((col) => {
      console.log(`  ${col.toUpperCase()}:`);
      for (const sec of page[col]) {
        const hdr = sec.isContinuation ? "[no header — continuation]" : `"${sec.category}"`;
        console.log(`    ${hdr}  (${sec.items.length} items)`);
        for (const it of sec.items) {
          const previewValue = it.value.length > 40 ? it.value.slice(0, 40) + "…" : it.value;
          console.log(`      • ${it.label}: ${previewValue}`);
        }
      }
    });
  });
}
main().catch(e => { console.error(e); process.exit(1); });
