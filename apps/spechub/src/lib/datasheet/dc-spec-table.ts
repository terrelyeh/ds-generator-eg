/**
 * Layout B's spec table (Data Center): which rows print, where the group
 * bands go, and where the table breaks across pages.
 *
 * Every spec group opens with a band, the first one included — the rule
 * layout A follows, so one sheet reads the same way in both. The first group
 * is usually "General": the parser consumes the sheet's "Technical
 * Specifications" row as its start marker (parseSpecSections in
 * lib/google/sheets.ts), so rows directly beneath it land in that fallback
 * category, exactly as they do for every AP and switch.
 *
 * The first group also carries the model's identity — Model Name and Model
 * Number — as its opening rows. They used to be two dark bands of their own
 * between the table title and the specs; as rows of the first group they
 * read as what they are, the first two specs.
 */

/** A band across the table, or one label/value row. */
export type DcSpecBlock =
  | { kind: "section"; title: string }
  | { kind: "row"; label: string; value: string };

interface SectionInput {
  category: string;
  sort_order: number;
  spec_items?: { label: string; value: string; sort_order: number }[] | null;
}

/** Blank and N/A cells print nothing — they would only spend the page budget. */
function printable(value: string): boolean {
  const v = value.trim();
  return v !== "" && v.toUpperCase() !== "N/A";
}

/**
 * `identity` opens the first group that prints. With no printable group at
 * all there is no table: two identity rows are not a spec sheet, and the
 * Generate gate reads an empty result as "no specs".
 */
export function buildDcSpecBlocks(
  sections: SectionInput[],
  identity: { label: string; value: string }[] = [],
): DcSpecBlock[] {
  const identityRows = identity
    .filter((r) => printable(r.value))
    .map((r) => ({ kind: "row" as const, label: r.label, value: r.value }));
  const blocks: DcSpecBlock[] = [];
  for (const section of [...sections].sort((a, b) => a.sort_order - b.sort_order)) {
    const rows = [...(section.spec_items ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .filter((i) => printable(i.value))
      .map((i) => ({ kind: "row" as const, label: i.label, value: i.value }));
    // A band over nothing would be a heading for an empty section.
    if (rows.length === 0) continue;
    const opensTable = blocks.length === 0;
    blocks.push({ kind: "section", title: section.category });
    if (opensTable) blocks.push(...identityRows);
    blocks.push(...rows);
  }
  return blocks;
}

/** Rough line count for text in a column that holds `charsPerLine` characters. */
function estLines(text: string, charsPerLine: number): number {
  return text
    .split("\n")
    .reduce((sum, seg) => sum + Math.max(1, Math.ceil(seg.trim().length / charsPerLine)), 0);
}

/**
 * Characters per line in the value column (392pt of 8pt Roboto) and the
 * label column. MEASURED, not guessed: on the five Data Center models the
 * longest single-paragraph values — 261, 269 and 299 characters — each
 * print on 3 lines, so the column holds about 100. The old guess of 86 gave
 * every one of them a phantom 4th line, and that 11pt is what pushed
 * SE210's AI group onto a page of its own. 96 leaves room for word wrap.
 */
const VALUE_CHARS_PER_LINE = 96;
const LABEL_CHARS_PER_LINE = 24;

/**
 * Estimated height in pt. A row is 11pt per line of its taller cell plus
 * 11pt of padding and rule. A band is one line of the same type with about
 * the same padding, so it costs what a one-line row costs.
 */
export function estimateDcBlockHeight(block: DcSpecBlock): number {
  if (block.kind === "section") return estLines(block.title, VALUE_CHARS_PER_LINE) * 11 + 11;
  return (
    Math.max(estLines(block.value, VALUE_CHARS_PER_LINE), estLines(block.label, LABEL_CHARS_PER_LINE)) * 11 +
    11
  );
}

/**
 * Room a band needs before it may start on the current page.
 *
 * Its whole section, when that section fits on a page by itself: split
 * two-and-two, S41's four AI rows left their last two on the next page with
 * no band over them, where they read as part of the section above. A
 * section too long for any page settles for its band plus first row — so a
 * band is never the last thing on a page either way.
 */
function roomForSection(blocks: DcSpecBlock[], start: number, pageBudget: number): number {
  const band = estimateDcBlockHeight(blocks[start]);
  let whole = band;
  for (let j = start + 1; j < blocks.length && blocks[j].kind === "row"; j++) {
    whole += estimateDcBlockHeight(blocks[j]);
  }
  if (whole <= pageBudget) return whole;
  const first = blocks[start + 1];
  return band + (first ? estimateDcBlockHeight(first) : 0);
}

/** Split blocks into pages by estimated height, keeping sections together (above). */
export function paginateDcSpecBlocks(
  blocks: DcSpecBlock[],
  firstPageBudget: number,
  restPageBudget: number,
): DcSpecBlock[][] {
  const pages: DcSpecBlock[][] = [];
  let current: DcSpecBlock[] = [];
  let used = 0;
  let budget = firstPageBudget;
  blocks.forEach((block, i) => {
    const h = estimateDcBlockHeight(block);
    const needed = block.kind === "section" ? roomForSection(blocks, i, restPageBudget) : h;
    if (used + needed > budget && current.length > 0) {
      pages.push(current);
      current = [];
      used = 0;
      budget = restPageBudget;
    }
    current.push(block);
    used += h;
  });
  if (current.length > 0) pages.push(current);
  return pages;
}

/**
 * Zebra flags for one page. The stripe restarts under every band, so the
 * first row of a group — like the first row of a page — is always the plain
 * one. Keyed off `:nth-child`, a band would count as a row and flip every
 * stripe beneath it.
 */
export function withStripes(page: DcSpecBlock[]): (DcSpecBlock & { alt: boolean })[] {
  let n = 0;
  return page.map((block) => {
    if (block.kind === "section") {
      n = 0;
      return { ...block, alt: false };
    }
    return { ...block, alt: n++ % 2 === 1 };
  });
}
