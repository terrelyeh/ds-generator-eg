/**
 * Does the guide still list the layouts the tool actually offers?
 *
 * The guide shows five layout swatches with their hex values. Nothing links
 * those to `PROJECT_LAYOUTS`, so adding a sixth layout — or retuning a
 * colour, which is a one-line change — leaves the page quietly describing a
 * picker that no longer exists.
 *
 * Same shape as `check:guide-labels`, and the same reason: a doc that drifts
 * is worse than no doc, because people stop trusting the parts that are
 * still right.
 *
 * The contract: every `data-layout="<key>"` in the guide must be a key in
 * PROJECT_LAYOUTS, every key must appear in the guide, and the `data-hex`
 * beside it must equal that layout's `primary`.
 *
 *   npm run check:guide-layouts
 */
import { readFileSync } from "node:fs";

const GUIDE = "apps/spechub/public/docs/tender-datasheets.html";
const THEMES = "apps/spechub/src/lib/project-datasheet/themes.ts";

/**
 * Parsed with a regex rather than imported: the module is TypeScript inside
 * a Next app with path aliases, and a guard that needs a build step is a
 * guard that gets skipped.
 */
function layoutsFromSource(src) {
  const body = src.slice(src.indexOf("PROJECT_LAYOUTS"));
  const out = new Map();
  // `  key: {` … `primary: "#xxxxxx"` — the first primary after each key.
  for (const m of body.matchAll(/^ {2}(\w+):\s*\{/gm)) {
    const rest = body.slice(m.index);
    const primary = rest.match(/primary:\s*"(#[0-9a-fA-F]{6})"/);
    if (primary) out.set(m[1], primary[1].toLowerCase());
  }
  return out;
}

const html = readFileSync(GUIDE, "utf8");
const themes = layoutsFromSource(readFileSync(THEMES, "utf8"));

if (themes.size === 0) {
  console.error(`✗ parsed no layouts out of ${THEMES} — the guard is checking nothing.`);
  process.exit(1);
}

const documented = new Map();
for (const block of html.matchAll(
  /data-layout="(\w+)"[\s\S]{0,600}?data-hex="(#[0-9a-fA-F]{6})"/g,
)) {
  documented.set(block[1], block[2].toLowerCase());
}

const problems = [];
for (const [key, hex] of themes) {
  if (!documented.has(key)) {
    problems.push(`版型 "${key}" 在 themes.ts 裡有，但指南頁沒有列。`);
  } else if (documented.get(key) !== hex) {
    problems.push(`版型 "${key}" 的顏色是 ${hex}，指南頁寫 ${documented.get(key)}。`);
  }
}
for (const key of documented.keys()) {
  if (!themes.has(key)) problems.push(`指南頁列了 "${key}"，但 themes.ts 裡沒有這個版型。`);
}

if (problems.length) {
  console.error(`✗ ${GUIDE} 和 ${THEMES} 對不起來：\n`);
  for (const p of problems) console.error(`   ${p}`);
  console.error(`\n改了版型就要更新指南頁的那一節（含截圖）。`);
  process.exit(1);
}

console.log(`✓ ${themes.size} layouts in the guide match PROJECT_LAYOUTS`);
