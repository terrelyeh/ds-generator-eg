import { describe, expect, it } from "vitest";
import {
  CATEGORY_HEADER_HEIGHT,
  HARD_COLUMN_LIMIT,
  SECTION_GAP,
  estimateRowHeight,
  splitIntoPages,
  type Section,
} from "./pagination";

/**
 * What a column will actually be worth once rendered.
 *
 * Deliberately reimplemented from the module's own exported pieces rather
 * than imported: the bugs below are both cases where the packer measured one
 * way and the page rendered another, so a test that borrows the packer's
 * internal measurement would agree with it about the wrong answer.
 */
function columnHeight(col: Section[], locale?: string): number {
  const content = col.reduce(
    (h, s) =>
      h +
      (s.isContinuation ? 0 : CATEGORY_HEADER_HEIGHT) +
      s.items.reduce((a, item) => a + estimateRowHeight(item, locale), 0),
    0,
  );
  return content + Math.max(0, col.length - 1) * SECTION_GAP;
}

const tinySection = (n: number): Section => ({
  category: `Category ${n}`,
  items: [{ label: `Label ${n}`, value: "short" }],
});

/** A section of one two-line row: 18pt header + 33pt row = 51pt. */
const smallSection = (n: number): Section => ({
  category: `Category ${n}`,
  items: [{ label: `Label ${n}`, value: "x".repeat(60) }],
});

/** A value that renders as `segments * 2` wrapped lines, with real newlines. */
const multilineValue = (segments: number): string =>
  Array.from({ length: segments }, (_, i) => `${String(i).padStart(2, "0")}-`.padEnd(60, "x")).join(
    "\n",
  );

describe("splitIntoPages — no column may exceed the hard limit", () => {
  it("counts the 12pt gap between sections when rebalancing one page", () => {
    // `balanceColumns` summed section heights and never added the gap that
    // `.spec-col > div + div` puts between them, so a column of many small
    // sections was under-measured by 12pt per boundary. Fifteen of them is
    // 168pt the overflow check could not see.
    // Sized so the packer and the rebalancer disagree. The packer respects
    // the gap and fits ten 51pt sections (618pt); the rebalancer, measuring
    // 51pt each and nothing between them, sees room for eleven (561pt) and
    // moves one over. Eleven of them really occupy 561 + 10 gaps = 681pt.
    const sections: Section[] = [
      ...Array.from({ length: 14 }, (_, i) => smallSection(i)),
      { category: "Networking Features", items: [{ label: "L2", value: multilineValue(17) }] },
    ];

    for (const page of splitIntoPages(sections)) {
      expect(columnHeight(page.left)).toBeLessThanOrEqual(HARD_COLUMN_LIMIT);
      expect(columnHeight(page.right)).toBeLessThanOrEqual(HARD_COLUMN_LIMIT);
    }
  });

  it("splits a long value to the number of lines it was asked for", () => {
    // `countWrappedLines` wraps each newline-separated segment on its own and
    // ceils per segment; `splitValueAtLines` accumulated raw width across the
    // whole string and ignored newlines entirely. So a head asked to occupy
    // 20 lines could render 34, and the column it was packed into overflowed
    // by the difference. Values with newlines are the normal case — the
    // renderer sets them `white-space: pre-line`.
    const sections: Section[] = [
      { category: "One Enormous Row", items: [{ label: "Ports", value: multilineValue(40) }] },
    ];

    for (const page of splitIntoPages(sections)) {
      expect(columnHeight(page.left)).toBeLessThanOrEqual(HARD_COLUMN_LIMIT);
      expect(columnHeight(page.right)).toBeLessThanOrEqual(HARD_COLUMN_LIMIT);
    }
  });

  it("keeps every column inside the limit for a realistic dense datasheet", () => {
    const sections: Section[] = [
      ...Array.from({ length: 8 }, (_, i) => tinySection(i)),
      { category: "Networking Features", items: [{ label: "L2", value: multilineValue(9) }] },
      { category: "Management", items: [{ label: "Protocols", value: multilineValue(6) }] },
      ...Array.from({ length: 6 }, (_, i) => tinySection(100 + i)),
    ];

    for (const page of splitIntoPages(sections, "zh-TW")) {
      expect(columnHeight(page.left, "zh-TW")).toBeLessThanOrEqual(HARD_COLUMN_LIMIT);
      expect(columnHeight(page.right, "zh-TW")).toBeLessThanOrEqual(HARD_COLUMN_LIMIT);
    }
  });
});
