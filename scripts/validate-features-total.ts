/**
 * Survey Features-list volume across ALL active products so we can pick
 * a sensible total-volume threshold (total chars, total wrapped lines).
 * Output: distribution + top offenders + per-line summary.
 *
 * Run: npx tsx scripts/validate-features-total.ts
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Features render at 11pt in ~260pt-wide columns (half of ~520pt inner width).
// Roughly 40-45 Latin chars per line, CJK chars count 2x.
const FEATURE_COL_WIDTH_CHARS = 42;

function charWidth(ch: string): number {
  return /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1;
}

function countFeatureLines(text: string): number {
  if (!text) return 0;
  let width = 0;
  for (const ch of text) width += charWidth(ch);
  return Math.max(1, Math.ceil(width / FEATURE_COL_WIDTH_CHARS));
}

async function main() {
  const { data: lines } = await supabase
    .from("product_lines")
    .select("id, name, label")
    .order("sort_order");

  const { data: products } = await supabase
    .from("products")
    .select("id, model_name, features, product_line_id, status")
    .eq("status", "active");

  if (!products?.length) return;

  const lineMap = new Map(
    (lines ?? []).map((l: { id: string; label: string; name: string }) => [l.id, l]),
  );

  type Row = {
    model: string;
    line: string;
    count: number;
    totalChars: number;
    totalLines: number;
    maxItemLines: number;
  };

  const rows: Row[] = [];
  for (const p of products as Array<{
    id: string;
    model_name: string;
    features: string[] | null;
    product_line_id: string;
  }>) {
    const feats = (p.features ?? []) as string[];
    if (!feats.length) continue;
    const totalChars = feats.reduce((s, f) => s + f.length, 0);
    const perItemLines = feats.map(countFeatureLines);
    const totalLines = perItemLines.reduce((s, x) => s + x, 0);
    const maxItemLines = Math.max(...perItemLines);
    const line = lineMap.get(p.product_line_id);
    rows.push({
      model: p.model_name,
      line: line?.label ?? "?",
      count: feats.length,
      totalChars,
      totalLines,
      maxItemLines,
    });
  }

  console.log(`\nTotal active products with features: ${rows.length}\n`);

  // Distribution of total wrapped lines
  const buckets = [
    { label: "≤ 8 lines (safe, 1 col)", max: 8 },
    { label: "9-12 lines", max: 12 },
    { label: "13-16 lines (fills 2 cols)", max: 16 },
    { label: "17-20 lines (overflow risk)", max: 20 },
    { label: "21+ lines (definitely overflow)", max: Infinity },
  ];
  console.log("━━━ Total wrapped lines distribution ━━━");
  let prev = 0;
  for (const b of buckets) {
    const cnt = rows.filter((r) => r.totalLines > prev && r.totalLines <= b.max).length;
    const pct = Math.round((cnt / rows.length) * 100);
    console.log(`  ${b.label.padEnd(35)} ${String(cnt).padStart(3)} products  ${pct}%`);
    prev = b.max;
  }

  // Distribution of total chars
  console.log("\n━━━ Total chars distribution ━━━");
  const charBuckets = [0, 300, 500, 700, 900, 1200, Infinity];
  const charLabels = ["≤ 300", "301-500", "501-700", "701-900", "901-1200", "1201+"];
  for (let i = 0; i < charBuckets.length - 1; i++) {
    const cnt = rows.filter(
      (r) => r.totalChars > charBuckets[i] && r.totalChars <= charBuckets[i + 1],
    ).length;
    const pct = Math.round((cnt / rows.length) * 100);
    console.log(`  ${charLabels[i].padEnd(10)} ${String(cnt).padStart(3)} products  ${pct}%`);
  }

  // Top 15 heaviest
  rows.sort((a, b) => b.totalLines - a.totalLines);
  console.log("\n━━━ Top 15 heaviest (by total wrapped lines) ━━━");
  console.log(
    "  Model            Line             Count  Chars  Lines  MaxItemLines",
  );
  for (const r of rows.slice(0, 15)) {
    const flag =
      r.totalLines > 20 ? "🔴" : r.totalLines > 16 ? "🟠" : r.totalLines > 12 ? "🟡" : "🟢";
    console.log(
      `  ${flag} ${r.model.padEnd(14)} ${r.line.padEnd(16)} ${String(r.count).padStart(5)}  ${String(r.totalChars).padStart(5)}  ${String(r.totalLines).padStart(5)}  ${String(r.maxItemLines).padStart(12)}`,
    );
  }

  // Per-line summary
  console.log("\n━━━ Per product line average ━━━");
  const byLine = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byLine.has(r.line)) byLine.set(r.line, []);
    byLine.get(r.line)!.push(r);
  }
  for (const [line, lrs] of byLine) {
    const avgLines = Math.round(lrs.reduce((s, r) => s + r.totalLines, 0) / lrs.length);
    const avgChars = Math.round(lrs.reduce((s, r) => s + r.totalChars, 0) / lrs.length);
    const maxLines = Math.max(...lrs.map((r) => r.totalLines));
    const overCount16 = lrs.filter((r) => r.totalLines > 16).length;
    console.log(
      `  ${line.padEnd(22)} n=${String(lrs.length).padStart(3)}  avg=${avgLines}L/${avgChars}c  max=${maxLines}L  >16L: ${overCount16}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
