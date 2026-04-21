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
// Bottom safety margin. Bumped from 40→72pt (1 inch) because per-row height
// estimates accumulate small errors over 30+ rows — a generous footer buffer
// triggers earlier column/page breaks so content never hugs the page edge.
export const BOTTOM_MARGIN = 72;
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

/**
 * Try to fit a whole section into a column with `availableHeight` pt remaining.
 * If the section doesn't fit entirely, split its items — what fits goes now,
 * the rest is returned as a new section labelled "<name> (cont.)".
 *
 * Guarantees at least one item per call (even if it's technically too tall
 * — better to let one item overflow slightly than to loop forever).
 */
function fitSection(
  section: Section,
  availableHeight: number,
): { fitted: Section | null; remaining: Section | null } {
  const headerH = CATEGORY_HEADER_HEIGHT;

  // Header alone doesn't fit → whole section goes to next column
  if (headerH >= availableHeight) {
    return { fitted: null, remaining: section };
  }

  let h = headerH;
  const fittedItems: typeof section.items = [];
  let i = 0;
  for (; i < section.items.length; i++) {
    const itemH = estimateItemHeight(section.items[i].value);
    if (h + itemH > availableHeight) {
      // Can't fit this item — but we must fit at least one so
      // we don't infinite-loop on a giant first item.
      if (fittedItems.length === 0) {
        fittedItems.push(section.items[i]);
        h += itemH;
        i++;
      }
      break;
    }
    fittedItems.push(section.items[i]);
    h += itemH;
  }

  if (fittedItems.length === 0) {
    return { fitted: null, remaining: section };
  }

  const fitted: Section = { category: section.category, items: fittedItems };
  const remaining: Section | null =
    i < section.items.length
      ? {
          category: `${section.category} (cont.)`,
          items: section.items.slice(i),
        }
      : null;

  return { fitted, remaining };
}

export function splitIntoPages(sections: Section[]): SpecPage[] {
  if (!sections.length) return [{ left: [], right: [] }];

  const pages: SpecPage[] = [];
  const queue: Section[] = [...sections];
  let splitOccurred = false;

  // Safety cap: large spec sheets with many continuations shouldn't balloon
  // into thousands of pages. If we exceed this, there's a bug; bail out.
  const MAX_PAGES = 20;

  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const left: Section[] = [];
    const right: Section[] = [];
    let leftH = 0;
    let rightH = 0;

    // Fill left column — split sections that don't fit
    while (queue.length > 0) {
      const remaining = AVAILABLE_HEIGHT - leftH;
      const nextSection = queue[0];
      const sectionH = estimateSectionHeight(nextSection);

      if (sectionH <= remaining) {
        // Whole section fits
        left.push(nextSection);
        leftH += sectionH;
        queue.shift();
      } else if (left.length === 0) {
        // Column empty but section too tall → try to fit what we can
        const { fitted, remaining: cont } = fitSection(nextSection, remaining);
        if (fitted) {
          left.push(fitted);
          leftH += estimateSectionHeight(fitted);
        }
        queue.shift();
        if (cont) {
          queue.unshift(cont);
          splitOccurred = true;
        }
      } else {
        // Column has content + won't fit next section → try partial split
        const { fitted, remaining: cont } = fitSection(nextSection, remaining);
        if (fitted && fitted.items.length > 0) {
          left.push(fitted);
          leftH += estimateSectionHeight(fitted);
          queue.shift();
          if (cont) queue.unshift(cont);
        } else {
          // Can't fit even one more item → move to right column
          break;
        }
      }
    }

    // Fill right column — same logic
    while (queue.length > 0) {
      const remaining = AVAILABLE_HEIGHT - rightH;
      const nextSection = queue[0];
      const sectionH = estimateSectionHeight(nextSection);

      if (sectionH <= remaining) {
        right.push(nextSection);
        rightH += sectionH;
        queue.shift();
      } else if (right.length === 0) {
        const { fitted, remaining: cont } = fitSection(nextSection, remaining);
        if (fitted) {
          right.push(fitted);
          rightH += estimateSectionHeight(fitted);
        }
        queue.shift();
        if (cont) {
          queue.unshift(cont);
          splitOccurred = true;
        }
      } else {
        const { fitted, remaining: cont } = fitSection(nextSection, remaining);
        if (fitted && fitted.items.length > 0) {
          right.push(fitted);
          rightH += estimateSectionHeight(fitted);
          queue.shift();
          if (cont) queue.unshift(cont);
        } else {
          break;
        }
      }
    }

    pages.push({ left, right });
  }

  // If only one page AND no section had to be split, rebalance for
  // aesthetic symmetry between the two columns. If a split did occur,
  // keep the fitSection-driven layout — rebalancing would blow the
  // column heights.
  if (pages.length === 1 && !splitOccurred) {
    return [balanceColumns(sections)];
  }

  return pages;
}
