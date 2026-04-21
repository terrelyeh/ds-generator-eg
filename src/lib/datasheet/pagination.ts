/**
 * Spec page pagination & column balancing logic.
 * Ported from the Python pdf_generator.py, enhanced with per-item height
 * estimation so long values that wrap to multiple lines don't blow the
 * page budget.
 */

export interface Section {
  category: string;
  items: { label: string; value: string }[];
  /**
   * True when this section is a continuation of one that started in the
   * previous column or page. The renderer uses this flag to SKIP the
   * grey category-header row — readers don't need "L2 Software Features
   * (cont.)" repeated; the items just flow naturally. Replaces the old
   * string-concatenation approach which stacked up "(cont.) (cont.) (cont.)".
   */
  isContinuation?: boolean;
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
// + border-bottom + vertical padding. Bumped 18→20pt to absorb per-row
// rendering variance (padding/border accumulate over 30+ rows).
// Each additional wrapped line of value ≈ 10pt (7pt text * ~1.4 leading).
export const SPEC_BASE_ROW_HEIGHT = 20;
export const SPEC_LINE_EXTRA = 10;

// Approx chars that fit on one line in a half-column. Reduced 62→52 after
// ECW515 showed actual rendering wraps more aggressively than estimated
// (em-dashes, slash-separated tokens, proportional font rendering).
// Under-estimating lines causes fitSection to pack rows that won't render
// within the column — so err on the conservative side.
const COL_WIDTH_CHARS = 52;

function charWidth(ch: string): number {
  return /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1;
}

function countWrappedLines(value: string): number {
  if (!value) return 1;
  const lines = value.split(/\n+/);
  let total = 0;
  for (const line of lines) {
    let width = 0;
    for (const ch of line) width += charWidth(ch);
    total += Math.max(1, Math.ceil(width / COL_WIDTH_CHARS));
  }
  return Math.max(1, total);
}

export function estimateItemHeight(value: string): number {
  const lines = countWrappedLines(value);
  return SPEC_BASE_ROW_HEIGHT + (lines - 1) * SPEC_LINE_EXTRA;
}

/**
 * Split a value string so the head occupies approximately `linesToKeep`
 * wrapped lines; the tail gets the remainder. Prefers to break at a
 * whitespace boundary so words aren't chopped mid-character. Returns
 * [head, tail] — both trimmed. If no clean split is found, returns
 * [value, ""] (whole thing stays together).
 */
function splitValueAtLines(
  value: string,
  linesToKeep: number,
): [string, string] {
  if (linesToKeep < 1) return ["", value];
  const targetWidth = linesToKeep * COL_WIDTH_CHARS;
  let accWidth = 0;
  let lastSpaceIdx = -1;
  let splitIdx = value.length;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    const w = charWidth(ch);
    if (accWidth + w > targetWidth) {
      // Prefer breaking at last whitespace within the head portion
      splitIdx = lastSpaceIdx > 0 ? lastSpaceIdx : i;
      break;
    }
    accWidth += w;
    if (/\s/.test(ch)) lastSpaceIdx = i;
  }
  const head = value.slice(0, splitIdx).trim();
  const tail = value.slice(splitIdx).trim();
  if (!head || !tail) return [value, ""];
  return [head, tail];
}

function estimateSectionHeight(section: Section): number {
  // Continuation sections don't re-render the category header
  let h = section.isContinuation ? 0 : CATEGORY_HEADER_HEIGHT;
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
 * the rest is returned as a new section with `isContinuation: true` so the
 * renderer knows to SUPPRESS the category header (avoids repeated
 * "L2 Software Features (cont.) (cont.)" at every column/page break).
 *
 * Mid-item splitting: if a single item's value is too tall to fit in the
 * remaining space, we split the value text at a line boundary. The head
 * portion fits in the current column under its original label; the tail
 * becomes a continuation item with label "<label> (cont.)" in the next
 * column. This "(cont.)" stays because the item label visually makes
 * sense to repeat (otherwise the tail value has no label at all).
 *
 * Guarantees at least one item per call (even if it's technically too tall
 * — better to let one item overflow slightly than to loop forever).
 */
function fitSection(
  section: Section,
  availableHeight: number,
  /**
   * Only force-fit an item (overshoot rather than return empty) when the
   * destination column is EMPTY. Without this guard, a continuation
   * section whose first item is 40pt would get force-pushed into a
   * column that only has 5pt left, causing the column to overshoot the
   * page budget and orphan the REAL next items to an almost-empty page.
   * See ECS1528P: Warranty was being pushed to page 2 because Package
   * Contents had been force-fit into a nearly-full right column.
   */
  allowForceFit = false,
): { fitted: Section | null; remaining: Section | null } {
  // Continuation sections skip the header row — only deduct header height
  // for the first (non-continuation) appearance of a section.
  const headerH = section.isContinuation ? 0 : CATEGORY_HEADER_HEIGHT;

  // Header alone doesn't fit → whole section goes to next column
  if (headerH >= availableHeight) {
    return { fitted: null, remaining: section };
  }

  let h = headerH;
  const fittedItems: typeof section.items = [];
  let i = 0;
  let midItemTail: { label: string; value: string } | null = null;

  for (; i < section.items.length; i++) {
    const item = section.items[i];
    const itemH = estimateItemHeight(item.value);

    if (h + itemH <= availableHeight) {
      fittedItems.push(item);
      h += itemH;
      continue;
    }

    // Doesn't fit whole — try to split the value across the column break.
    // Need room for base row (1 line) + at least 1 extra wrap line to make
    // the split worthwhile (otherwise just push the whole item to next col).
    const roomLeft = availableHeight - h;
    const linesThatFit = Math.floor(
      (roomLeft - SPEC_BASE_ROW_HEIGHT) / SPEC_LINE_EXTRA,
    ) + 1;
    const totalLines = countWrappedLines(item.value);

    if (linesThatFit >= 2 && linesThatFit < totalLines) {
      const [head, tail] = splitValueAtLines(item.value, linesThatFit);
      if (head && tail) {
        fittedItems.push({ label: item.label, value: head });
        midItemTail = { label: `${item.label} (cont.)`, value: tail };
        i++;
        break;
      }
    }

    // Couldn't split cleanly. Force-fit ONLY if caller says it's OK
    // (empty destination column) — otherwise break and let the item
    // flow naturally to the next column/page without overshooting this
    // one. See `allowForceFit` doc for why this guard matters.
    if (fittedItems.length === 0 && allowForceFit) {
      fittedItems.push(item);
      h += itemH;
      i++;
    }
    break;
  }

  if (fittedItems.length === 0 && !midItemTail) {
    return { fitted: null, remaining: section };
  }

  // Preserve the incoming isContinuation flag on the `fitted` piece too —
  // if the section was already a continuation (e.g. carried over from the
  // previous column), the fitted portion shouldn't re-show the header.
  const fitted: Section = {
    category: section.category,
    items: fittedItems,
    isContinuation: section.isContinuation,
  };

  // Build remaining: midItemTail (if any) + leftover items after index i.
  // The remainder is always a continuation — the header already appeared
  // (or was already suppressed) on the fitted portion, so the next column
  // should just flow the items without re-introducing the grey header bar.
  const leftoverItems = section.items.slice(i);
  const hasRemaining = midItemTail !== null || leftoverItems.length > 0;
  const remaining: Section | null = hasRemaining
    ? {
        category: section.category,
        isContinuation: true,
        items: midItemTail
          ? [midItemTail, ...leftoverItems]
          : leftoverItems,
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
        // Column empty but section too tall → try to fit what we can.
        // Force-fit at least one item so we don't infinite-loop on a
        // giant first item.
        const { fitted, remaining: cont } = fitSection(nextSection, remaining, true);
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
        // Column has content + won't fit next section → try partial split.
        // DON'T force-fit here — we'd rather break and send the item to
        // the next column than overshoot this one and orphan later items.
        const { fitted, remaining: cont } = fitSection(nextSection, remaining, false);
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
        // Empty column → allow force-fit (prevents infinite loop on
        // oversized sections that don't fit any column).
        const { fitted, remaining: cont } = fitSection(nextSection, remaining, true);
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
        // Has content → no force-fit; let the rest flow to next page.
        const { fitted, remaining: cont } = fitSection(nextSection, remaining, false);
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
