/**
 * Layout B's spec table (Data Center): which rows print, where the section
 * bands go, and where the table breaks across pages.
 *
 * The table used to flatten every section into one run of rows. That was
 * true to the sheets when the layout was built — they had no category rows,
 * so everything parsed into a single implicit section — but PMs have since
 * added them, and flattening dropped "High-Performance AI & Graphics
 * Acceleration" without a trace.
 *
 * Why the first section usually prints WITHOUT a band: the parser consumes
 * the sheet's "Technical Specifications" row as its start marker
 * (parseSpecSections in lib/google/sheets.ts), so rows directly beneath it
 * land in the fallback category "General". The page title already says
 * Technical Specifications; a band repeating it — or reading "General" —
 * would be noise. A section the sheet names gets a band wherever it sits,
 * first or not.
 */

/** A band across the table, or one label/value row. */
export type DcSpecBlock =
  | { kind: "section"; title: string }
  | { kind: "row"; label: string; value: string };

/** The parser's name for rows that sit directly under "Technical Specifications". */
export const IMPLICIT_SECTION = "General";

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

export function buildDcSpecBlocks(sections: SectionInput[]): DcSpecBlock[] {
  const blocks: DcSpecBlock[] = [];
  for (const section of [...sections].sort((a, b) => a.sort_order - b.sort_order)) {
    const rows = [...(section.spec_items ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .filter((i) => printable(i.value))
      .map((i) => ({ kind: "row" as const, label: i.label, value: i.value }));
    // A band over nothing would be a heading for an empty section.
    if (rows.length === 0) continue;
    if (section.category !== IMPLICIT_SECTION) {
      blocks.push({ kind: "section", title: section.category });
    }
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
 * Estimated height in pt. A row is 11pt per line of its taller cell plus
 * 11pt of padding and rule (8pt type; the 385pt value column holds ~86
 * characters, the 132pt label column ~24). A band is one line of the same
 * type with about the same padding, so it costs what a one-line row costs.
 */
export function estimateDcBlockHeight(block: DcSpecBlock): number {
  if (block.kind === "section") return estLines(block.title, 86) * 11 + 11;
  return Math.max(estLines(block.value, 86), estLines(block.label, 24)) * 11 + 11;
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
 * first row of a section — like the first row of a page — is always the
 * plain one. With a single section this is exactly what the old
 * `:nth-child(even)` rule printed; keyed off nth-child, a band would count
 * as a row and flip every stripe beneath it.
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
