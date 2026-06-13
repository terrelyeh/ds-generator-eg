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

// Height estimates (in pt) for page layout. Must match actual CSS in
// preview/[model]/page.tsx — under-estimating these means fitSection
// thinks the column has more space than it really does, so content
// gets packed past the designed BOTTOM_MARGIN and hugs the page edge.
export const PAGE_HEIGHT = 792;
export const TOP_BAR_HEIGHT = 22; // .top-bar { height: 21.4pt } rounded up
// .spec-page-title { padding-top: 27pt; font-size: 14pt (~16.8pt line);
// margin-bottom: 18pt } = ~62pt. Was 42pt — under-estimated by 20pt,
// which silently ate into BOTTOM_MARGIN on dense spec pages (see
// ECW510P zh-TW page 2 where columns rendered ~20pt past the designed
// 1-inch margin and visually hugged the page number).
export const SPEC_TITLE_HEIGHT = 62;
// Bottom safety margin. Bumped from 40→72pt (1 inch) because per-row height
// estimates accumulate small errors over 30+ rows — a generous footer buffer
// triggers earlier column/page breaks so content never hugs the page edge.
export const BOTTOM_MARGIN = 72;
export const AVAILABLE_HEIGHT =
  PAGE_HEIGHT - TOP_BAR_HEIGHT - SPEC_TITLE_HEIGHT - BOTTOM_MARGIN;

// Real CSS:
//   .spec-category-header { font-size: 7.5pt (~9pt line); padding 2.5+2.5pt;
//                           margin-top 6pt + margin-bottom 2pt } = ~22pt
//   (first one has margin-top:0 → ~16pt, but the over-estimate on the first
//   is fine and offsets row-level drift.)
// Was 18pt — under-estimated by 4pt per header. For ESG320 with 7 sections
// that's ~28pt cumulative drift past BOTTOM_MARGIN.
export const CATEGORY_HEADER_HEIGHT = 22;

/**
 * Is a spec value effectively "no meaningful data" and therefore not
 * worth rendering? Matches N/A variations, em-dash placeholders, and
 * empty strings. PMs sometimes fill "N/A" in the sheet to keep the row
 * present in the spec template, but once rendered the row is just
 * noise — especially in categories like Compliance where Scanning
 * Radio / BLE being N/A adds nothing useful to the datasheet.
 */
export function isBlankOrNA(value: string | null | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/^(n\/?a|na|not\s+applicable)$/i.test(trimmed)) return true;
  if (/^[-–—]+$/.test(trimmed)) return true;
  return false;
}

/**
 * Filter out spec items whose value is blank / N/A, and drop any
 * section that becomes empty as a result. Use this everywhere spec
 * data is fed to pagination or a renderer so N/A rows never take up
 * layout budget or visual space.
 */
export function filterRenderableSections<
  S extends { category: string; items: { label: string; value: string }[] },
>(sections: S[]): S[] {
  return sections
    .map((s) => ({ ...s, items: s.items.filter((i) => !isBlankOrNA(i.value)) }))
    .filter((s) => s.items.length > 0);
}

/**
 * Is a spec value a "to be determined" placeholder? PMs use this for
 * specs that haven't been finalized yet (e.g. `TBD` for Maximum Power
 * Consumption before final testing). The value still renders in the
 * PDF as-is — this helper just lets the UI tag such rows so the PM
 * can quickly scan for unfinished specs before generating the PDF.
 */
export function isTBD(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  return /^(tbd|t\.b\.d\.?|to\s+be\s+determined)$/i.test(v);
}

/**
 * Does a spec value look like multiple short items run together without
 * separators? Flags cases like "FCC CE IC JP UKCA" where the PM forgot
 * to put commas or newlines between certifications / standards /
 * bands. Rendered as-is, these become a single unreadable blob in the
 * PDF. Used to surface a ⚠️ hint next to the value in the product
 * detail page so the PM can fix it in the Sheet.
 *
 * Intentionally conservative — must satisfy ALL conditions so real
 * single-item values (`2 x 2.4 GHz: 5 dBi`, `External Omni-Directional`,
 * `IEEE 802.11ax`) never false-positive:
 *
 *   1. No `\n` and no `,` anywhere in the value
 *   2. Length > 10 chars (too short isn't worth flagging)
 *   3. No colons / parens / slashes / em-dashes / decimals (suggest single compound value)
 *   4. No unit-qualified numbers (GHz, Mbps, dBi, °C, …)
 *   5. No CJK chars (rule is tuned for Latin token lists)
 *   6. ≥ 3 space-separated tokens
 *   7. Every token ≤ 6 characters (longer tokens usually part of a phrase)
 */
export function looksLikeUnseparatedList(value: string): boolean {
  const v = value.trim();
  if (!v || v.includes("\n") || v.includes(",")) return false;
  if (v.length <= 10) return false;
  if (/[():/–—]/.test(v)) return false;
  if (/\d+\.\d/.test(v)) return false;
  if (
    /\b\d+\s*(GHz|MHz|Hz|Mbps|Gbps|Kbps|dBi|dBm|mW|W|A|V|°C|°F|%|pt|nm|mm|cm|m|kg|g|in|inch|lb|lbs|ft|oz|sec|ms|hrs?|days?)\b/i.test(
      v,
    )
  ) {
    return false;
  }
  if (/[\u3000-\u9fff\uff00-\uffef]/.test(v)) return false;
  const tokens = v.split(/\s+/);
  if (tokens.length < 3) return false;
  for (const t of tokens) {
    if (t.length > 6) return false;
  }
  return true;
}

// A single unwrapped spec row (matches actual CSS in preview/[model]):
//   padding 2pt+2pt + label 7pt×1.2 + value-margin 1pt + value 7pt×1.2
//     + border-bottom 0.5pt ≈ 22.3pt for Latin text
// CJK fonts (Zen Kaku Gothic / Noto Sans TC) render with larger intrinsic
// leading (~1.3-1.4 line-height) vs Latin (~1.2), so each row is ~1.5-2pt
// taller. For ESG510 ja PDF that's 36 items × ~1.5pt ≈ 54pt accumulated
// drift past BOTTOM_MARGIN → bottom rows scrape the page edge. Locale-
// aware metrics fix this without wasting space on EN datasheets.
//
// Calibration reference (from real PDF rendering):
//   EN: ~22.3pt per row, ~8.4pt per extra wrap-line
//   JA: ~24pt per row, ~10pt per extra wrap-line (CJK leading + occasional
//       label wrap when Japanese spec_label_translations are long)
//   zh-TW: ~25pt per row, ~11pt per extra wrap-line
export interface LocaleRowMetrics {
  baseRowHeight: number;
  lineExtra: number;
}
export const LOCALE_ROW_METRICS: Record<string, LocaleRowMetrics> = {
  // EN bumped 22→23 (real ~22.3pt). 0.7pt over-estimate per row provides
  // a safety margin that accumulates ~25pt for dense 36-item ESG datasheets,
  // ensuring last row doesn't kiss BOTTOM_MARGIN.
  default: { baseRowHeight: 23, lineExtra: 10 },
  ja: { baseRowHeight: 24, lineExtra: 11 },
  "zh-TW": { baseRowHeight: 25, lineExtra: 12 },
};
function rowMetricsFor(locale?: string): LocaleRowMetrics {
  return LOCALE_ROW_METRICS[locale ?? "default"] ?? LOCALE_ROW_METRICS.default;
}
// Default constants kept as exports for backwards compatibility with
// callers that don't yet thread locale (layout-check fallback path).
export const SPEC_BASE_ROW_HEIGHT = LOCALE_ROW_METRICS.default.baseRowHeight;
export const SPEC_LINE_EXTRA = LOCALE_ROW_METRICS.default.lineExtra;

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

export function estimateItemHeight(value: string, locale?: string): number {
  const m = rowMetricsFor(locale);
  const lines = countWrappedLines(value);
  return m.baseRowHeight + (lines - 1) * m.lineExtra;
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

function estimateSectionHeight(section: Section, locale?: string): number {
  // Continuation sections don't re-render the category header
  let h = section.isContinuation ? 0 : CATEGORY_HEADER_HEIGHT;
  for (const item of section.items) {
    h += estimateItemHeight(item.value, locale);
  }
  return h;
}

/**
 * Aesthetic single-page rebalance: distribute whole sections between
 * left and right column so heights are roughly equal. Only used when no
 * section had to be split — the caller (splitIntoPages) preserves the
 * fitSection-driven layout otherwise.
 *
 * Height-based, not count-based: ESG320 has 36 items split 19/17 by
 * count, but the right side ends up 760pt of content vs left's 416pt
 * (Networking Features alone is 170pt over 16 lines). Count-based
 * splits overflow the page in that case. We walk sections in order and
 * pick the boundary whose |leftH - rightH| is smallest.
 */
function balanceColumns(sections: Section[], locale?: string): SpecPage {
  if (sections.length <= 1) {
    return { left: sections, right: [] };
  }

  const heights = sections.map((s) => estimateSectionHeight(s, locale));
  const totalH = heights.reduce((a, b) => a + b, 0);

  // Try every split index 1..N-1 and pick the one minimising imbalance.
  // Also require both columns fit in AVAILABLE_HEIGHT — if any candidate
  // overflows, prefer one that doesn't, even if slightly less balanced.
  let bestIdx = 1;
  let bestScore = Infinity;
  let runningH = 0;
  for (let i = 0; i < sections.length - 1; i++) {
    runningH += heights[i];
    const leftH = runningH;
    const rightH = totalH - runningH;
    const overflowPenalty =
      (leftH > AVAILABLE_HEIGHT ? leftH - AVAILABLE_HEIGHT : 0) +
      (rightH > AVAILABLE_HEIGHT ? rightH - AVAILABLE_HEIGHT : 0);
    const imbalance = Math.abs(leftH - rightH);
    // Overflow weighted 10x — non-overflowing splits always beat overflowing ones
    const score = imbalance + overflowPenalty * 10;
    if (score < bestScore) {
      bestScore = score;
      bestIdx = i + 1;
    }
  }

  return {
    left: sections.slice(0, bestIdx),
    right: sections.slice(bestIdx),
  };
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
  locale?: string,
): { fitted: Section | null; remaining: Section | null } {
  const rowM = rowMetricsFor(locale);
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
    const itemH = estimateItemHeight(item.value, locale);

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
      (roomLeft - rowM.baseRowHeight) / rowM.lineExtra,
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

export function splitIntoPages(sections: Section[], locale?: string): SpecPage[] {
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
      const sectionH = estimateSectionHeight(nextSection, locale);

      if (sectionH <= remaining) {
        // Whole section fits
        left.push(nextSection);
        leftH += sectionH;
        queue.shift();
      } else if (left.length === 0) {
        // Column empty but section too tall → try to fit what we can.
        // Force-fit at least one item so we don't infinite-loop on a
        // giant first item.
        const { fitted, remaining: cont } = fitSection(nextSection, remaining, true, locale);
        if (fitted) {
          left.push(fitted);
          leftH += estimateSectionHeight(fitted, locale);
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
        const { fitted, remaining: cont } = fitSection(nextSection, remaining, false, locale);
        if (fitted && fitted.items.length > 0) {
          left.push(fitted);
          leftH += estimateSectionHeight(fitted, locale);
          queue.shift();
          if (cont) {
            queue.unshift(cont);
            // A partial split happened — must skip the single-page
            // balanceColumns rebalance below, otherwise the careful
            // fitSection-driven layout gets overwritten with a naive
            // (count-based) split that can overflow the page.
            splitOccurred = true;
          }
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
      const sectionH = estimateSectionHeight(nextSection, locale);

      if (sectionH <= remaining) {
        right.push(nextSection);
        rightH += sectionH;
        queue.shift();
      } else if (right.length === 0) {
        // Empty column → allow force-fit (prevents infinite loop on
        // oversized sections that don't fit any column).
        const { fitted, remaining: cont } = fitSection(nextSection, remaining, true, locale);
        if (fitted) {
          right.push(fitted);
          rightH += estimateSectionHeight(fitted, locale);
        }
        queue.shift();
        if (cont) {
          queue.unshift(cont);
          splitOccurred = true;
        }
      } else {
        // Has content → no force-fit; let the rest flow to next page.
        const { fitted, remaining: cont } = fitSection(nextSection, remaining, false, locale);
        if (fitted && fitted.items.length > 0) {
          right.push(fitted);
          rightH += estimateSectionHeight(fitted, locale);
          queue.shift();
          if (cont) {
            queue.unshift(cont);
            splitOccurred = true; // see comment in left-column branch
          }
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
    return [balanceColumns(sections, locale)];
  }

  return pages;
}
