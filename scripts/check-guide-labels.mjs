/**
 * Does the Tender Datasheets guide still describe the screen?
 *
 * The guide names buttons, tabs and panels. Nothing links those names to the
 * components that render them, so a PR that renames a button has no reason to
 * touch the guide — and the guide quietly starts teaching people a tool that
 * does not exist. That has already happened twice: it pointed at
 * "New project datasheet" after the button became 新增標案 datasheet, and it
 * described the add-model fork as two paths after it became three.
 *
 * Same shape as `check:feature-tags`: turn a silent drift into a loud failure.
 *
 * ── The contract ──────────────────────────────────────────────────────────
 * A string in the guide wrapped in `<span data-ui>` is a claim that those
 * exact characters are on screen. This script checks every one of them
 * against the source.
 *
 * Only marked strings are checked. Blanket-checking the prose would flag
 * every sentence that merely talks about a feature, and a guard that cries
 * wolf gets muted — which is worse than not having one.
 *
 * `〈…〉` marks a runtime value: `② 只有〈型號〉的調整` matches the source's
 * `② 只有 {shortName} 的調整`.
 *
 *   npm run check:guide-labels
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const GUIDE = "apps/spechub/public/docs/tender-datasheets.html";
const SRC = "apps/spechub/src";

function sourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

/** Marked labels, in the order they appear, de-duplicated. */
function markedLabels(html) {
  const found = [...html.matchAll(/<span data-ui>([^<]+)<\/span>/g)].map((m) => m[1]);
  return [...new Set(found)];
}

/**
 * A label becomes a regex so that `〈…〉` can stand in for a value the
 * component fills at runtime. Everything else is matched literally.
 */
function toPattern(label) {
  const parts = label.split(/〈[^〉]*〉/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(parts.join(".{1,40}"));
}

const html = readFileSync(GUIDE, "utf8");
const labels = markedLabels(html);
if (labels.length === 0) {
  console.error(`✗ ${GUIDE} has no <span data-ui> labels — the guard is checking nothing.`);
  process.exit(1);
}

/**
 * Comments are stripped before searching.
 *
 * The first version of this script did not do that, and it was silently
 * green: a planted rename of 從廠商規格書建立 still "passed" because the
 * words survived in a code comment two files away. A guard that matches the
 * text ABOUT a button rather than the button is worse than none — it reports
 * safety while the screen and the guide have already parted company.
 */
function stripComments(text) {
  return text
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ") // {/* JSX */}
    .replace(/\/\*[\s\S]*?\*\//g, " ") //             /* block */
    .replace(/^[^\S\n]*\/\/.*$/gm, " "); //             // line
}

const files = sourceFiles(SRC).map((f) => ({
  f,
  text: stripComments(readFileSync(f, "utf8")),
}));
const missing = [];

for (const label of labels) {
  const re = toPattern(label);
  if (!files.some(({ text }) => re.test(text))) missing.push(label);
}

if (missing.length) {
  console.error(`✗ ${missing.length} label(s) in the guide are no longer in the UI:\n`);
  for (const m of missing) console.error(`   「${m}」`);
  console.error(
    `\n   Either the screen changed and ${GUIDE} needs updating,\n` +
      `   or the wording moved and the guide should follow it.\n`,
  );
  process.exit(1);
}

console.log(`✓ ${labels.length} UI labels in the guide all still exist in ${SRC}/`);
