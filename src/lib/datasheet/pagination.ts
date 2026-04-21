/**
 * Spec page pagination & column balancing logic.
 * Ported from the Python pdf_generator.py, enhanced with per-item height
 * estimation so long values that wrap to multiple lines don't blow the
 * page budget.
 */

interface Section {
  category: string;
  items: { label: string; value: string }[];
}

interface SpecPage {
  left: Section[];
  right: Section[];
}

// Height estimates (in pt) for page layout
export const PAGE_HEIGHT = 792;
export const TOP_BAR_HEIGHT = 21;
export const SPEC_TITLE_HEIGHT = 42; // title + margin
export const BOTTOM_MARGIN = 40; // page number + safety margin
export const AVAILABLE_HEIGHT =
  PAGE_HEIGHT - TOP_BAR_HEIGHT - SPEC_TITLE_HEIGHT - BOTTOM_MARGIN;

export const CATEGORY_HEADER_HEIGHT = 18;

// A single unwrapped spec row: label (7pt) on top + value (7pt) underneath
// + border-bottom + 2pt vertical padding ≈ 18pt.
// Each additional wrapped line of value ≈ 9pt (7pt text * 1.3 leading).
export const SPEC_BASE_ROW_HEIGHT = 18;
export const SPEC_LINE_EXTRA = 9;

// Approx chars that fit on one line in a half-column (595/2 - gutter ≈ 280pt
// wide × 7pt font ≈ ~60-70 chars for Latin text). CJK chars are ~2x wider,
// so CJK-heavy values wrap more aggressively — we normalise roughly by
// counting each CJK char as 2 "slots".
const COL_WIDTH_CHARS = 62;

function countWrappedLines(value: string): number {
  if (!value) return 1;
  const lines = value.split(/\n+/);
  let total = 0;
  for (const line of lines) {
    // Count CJK codepoints as 2 for width purposes
    let width = 0;
    for (const ch of line) {
      width += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1;
    }
    total += Math.max(1, Math.ceil(width / COL_WIDTH_CHARS));
  }
  return Math.max(1, total);
}

export function estimateItemHeight(value: string): number {
  const lines = countWrappedLines(value);
  return SPEC_BASE_ROW_HEIGHT + (lines - 1) * SPEC_LINE_EXTRA;
}

function estimateSectionHeight(section: Section): number {
  let h = CATEGORY_HEADER_HEIGHT;
  for (const item of section.items) {
    h += estimateItemHeight(item.value);
  }
  return h;
}

function balanceColumns(sections: Section[]): SpecPage {
  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
  const target = totalItems / 2;

  const left: Section[] = [];
  const right: Section[] = [];
  let count = 0;
  let splitDone = false;

  for (const section of sections) {
    if (!splitDone && count + section.items.length <= target + 2) {
      left.push(section);
      count += section.items.length;
    } else {
      splitDone = true;
      right.push(section);
    }
  }

  return { left, right };
}

export function splitIntoPages(sections: Section[]): SpecPage[] {
  if (!sections.length) return [{ left: [], right: [] }];

  const pages: SpecPage[] = [];
  const remaining = [...sections];

  while (remaining.length > 0) {
    const left: Section[] = [];
    const right: Section[] = [];
    let leftH = 0;
    let rightH = 0;
    let i = 0;

    // Fill left column
    while (i < remaining.length) {
      const sh = estimateSectionHeight(remaining[i]);
      if (leftH + sh <= AVAILABLE_HEIGHT || left.length === 0) {
        left.push(remaining[i]);
        leftH += sh;
        i++;
      } else {
        break;
      }
    }

    // Fill right column
    while (i < remaining.length) {
      const sh = estimateSectionHeight(remaining[i]);
      if (rightH + sh <= AVAILABLE_HEIGHT || right.length === 0) {
        right.push(remaining[i]);
        rightH += sh;
        i++;
      } else {
        break;
      }
    }

    pages.push({ left, right });
    remaining.splice(0, i);
  }

  // If only one page, balance columns evenly
  if (pages.length === 1) {
    return [balanceColumns(sections)];
  }

  return pages;
}
