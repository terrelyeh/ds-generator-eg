/**
 * Cover page dynamic layout estimation.
 *
 * The cover has three zones stacked vertically between the hero image
 * (top 0-210pt) and the page footer (bottom 0-36pt):
 *
 *   ┌──────────────────────┐  top: 0
 *   │  Hero + Hardware img │
 *   │   (fixed 0-270pt)    │
 *   ├──────────────────────┤  270pt (overview starts)
 *   │  Overview section    │  ← flex-sized to remaining space
 *   │  (left half, 270pt)  │
 *   ├──────────────────────┤  (dynamic boundary)
 *   │  20pt visual gap     │
 *   ├──────────────────────┤
 *   │  Features wrapper    │  ← grows from bottom, capped at MAX
 *   │  (full width)        │
 *   └──────────────────────┘  756pt
 *                             36pt bottom page margin
 *
 * The "manual designer" workflow was: size features to fit items, then
 * push overview into whatever vertical space remains. This module
 * reproduces that algorithm programmatically.
 *
 * Hard caps prevent runaway content — if features content would need
 * more than FEATURES_MAX_HEIGHT, the render will clip and the layout
 * check flags overflow.
 */

// ─── Zone constants (pt) ────────────────────────────────────────────
export const COVER_ZONE_TOP = 270;         // where overview starts
export const COVER_ZONE_BOTTOM = 756;      // where features-wrapper ends (792 - 36 bottom margin)
export const COVER_ZONE_HEIGHT = COVER_ZONE_BOTTOM - COVER_ZONE_TOP; // 486pt
export const COVER_FOOTER_MARGIN = 36;

// Features chrome = title (14pt + 10pt margin) + box vertical padding (18+18) = ~60pt
export const FEATURES_CHROME = 60;
export const FEATURES_MAX_HEIGHT = 320;    // hard cap — beyond this, it looks cramped

// Text metrics (conservative — slightly over-estimate to avoid under-counting)
export const LINE_HEIGHT_PT = 15;          // 11pt font × ~1.35 leading
export const ITEM_MARGIN_PT = 8;           // margin-bottom per feature item

// Column widths (in "char slots" — CJK chars count as 2) calibrated
// per-locale against visual verification. Overview and features render
// at DIFFERENT font sizes (overview larger), so each locale tracks the
// two line-heights separately. This is particularly important for CJK
// where the gap between overview font (11.5/12pt) and feature font
// (10.5/11pt) is meaningful.
//
// English calibration points:
//   ECW201L-AC (600 char overview) overflows 201pt → 12 lines × 15pt + 25pt title = 205pt
//   ECS2528FP (430 char) fits 148pt → 8 lines × 15 = 145pt
//   ECC500 (728 char) fits 269pt → 14 lines × 15 = 235pt
//
// CJK estimates (2026-04-21 verified against ECC100 visual):
//   ja:   pre-split estimate said 20pt overflow — matches PDF render
//   zh:   pre-split estimate said 9pt overflow — matches "不到半行" visual
// So chars-per-line and overview line-height were already correct.
// Splitting feature line-height into its own (smaller) number is the
// only metric change — it affects the features block, not overview.
export const OVERVIEW_WIDTH_CHARS = 54; // default (English)
export const FEATURE_COL_WIDTH_CHARS = 42;

/**
 * Cover gap — visual breathing room between overview and features.
 * CJK uses a tighter 10pt gap to buy back space for the larger CJK
 * line-height. Still visually acceptable at print size.
 */
export const COVER_GAP_DEFAULT = 20;
export const COVER_GAP_CJK = 10;

export interface LocaleMetrics {
  overviewCharsPerLine: number;
  featureCharsPerLine: number;
  overviewLineHeightPt: number;
  featureLineHeightPt: number;
  itemMarginPt: number;
  /** Visual gap between overview and features — tighter for CJK */
  coverGapPt: number;
}

export const LOCALE_METRICS: Record<string, LocaleMetrics> = {
  default: {
    overviewCharsPerLine: 54,
    featureCharsPerLine: 42,
    overviewLineHeightPt: 15,
    featureLineHeightPt: 15,
    itemMarginPt: 8,
    coverGapPt: COVER_GAP_DEFAULT,
  },
  ja: {
    overviewCharsPerLine: 46,
    featureCharsPerLine: 38,
    overviewLineHeightPt: 17, // 11.5pt × 1.5
    featureLineHeightPt: 15,  // 10.5pt × 1.45 — smaller than overview!
    itemMarginPt: 9,
    coverGapPt: COVER_GAP_CJK,
  },
  "zh-TW": {
    overviewCharsPerLine: 44,
    featureCharsPerLine: 34,
    overviewLineHeightPt: 18, // 12pt × 1.5
    featureLineHeightPt: 16,  // 11pt × 1.45 — smaller than overview!
    itemMarginPt: 10,
    coverGapPt: COVER_GAP_CJK,
  },
};

function metricsFor(locale: string | undefined): LocaleMetrics {
  return LOCALE_METRICS[locale ?? "default"] ?? LOCALE_METRICS.default;
}

// ─── Helpers ────────────────────────────────────────────────────────
function charWidth(ch: string): number {
  return /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1;
}

function countLines(text: string, colWidth: number): number {
  if (!text) return 0;
  const lines = text.split(/\n+/);
  let total = 0;
  for (const line of lines) {
    let width = 0;
    for (const ch of line) width += charWidth(ch);
    total += Math.max(1, Math.ceil(width / colWidth));
  }
  return Math.max(1, total);
}

// ─── Main estimator ─────────────────────────────────────────────────
export interface CoverLayoutEstimate {
  /** Height (pt) the features-wrapper will occupy — use for CSS style */
  featuresHeight: number;
  /** CSS bottom (pt) for overview-section so it ends above features */
  overviewBottom: number;
  /** Vertical space (pt) actually available to overview */
  overviewSpaceAvailable: number;
  /** Estimated height (pt) overview content wants */
  overviewWantedHeight: number;
  /** Wrap-line counts (for diagnostics) */
  overviewLines: number;
  featuresPerColLines: number;
  featuresTotalLines: number;
  /** Did features get clipped by MAX cap? */
  featuresCapped: boolean;
  /** Does overview content exceed the dynamic space? */
  overviewOverflow: boolean;
  /** Either cap hit → true break */
  willOverflow: boolean;
  /** Natural height features wants without the cap */
  featuresWantedHeight: number;
}

/**
 * Distribute features across two columns using **balanced column-first**
 * ordering: items go to the left column in their original order until
 * adding the next item would push the left column past half the total
 * estimated height, then the remaining items fill the right column.
 *
 * Why not pure column-first (ceil(n/2) split)? When item lengths vary
 * a lot (ECW560: items 1-3 = 3 lines each, 4-11 = 1 line each), naive
 * count-based split makes the left column 16 lines tall vs right 5 lines.
 *
 * Why not greedy height-balance (previous behavior)? It interleaves items
 * across columns (1,3,5 left / 2,4,6 right), which breaks reading order —
 * PMs list features by priority, so column-first reading is more natural.
 *
 * Balanced column-first preserves order AND keeps columns visually close:
 *   - ECW560: left = items 1-3 (9 lines), right = items 4-11 (8 lines)
 *   - Typical 14 even features: left = 1-7, right = 8-14
 */
export function balanceFeatureColumns(
  features: string[],
  locale?: string,
): {
  left: string[];
  right: string[];
} {
  const m = metricsFor(locale);
  if (features.length === 0) return { left: [], right: [] };
  if (features.length === 1) return { left: [features[0]], right: [] };

  // Pre-compute each item's height in pt.
  const heights = features.map(
    (f) => countLines(f, m.featureCharsPerLine) * m.featureLineHeightPt + m.itemMarginPt,
  );
  const totalH = heights.reduce((s, h) => s + h, 0);
  const halfH = totalH / 2;

  // Walk in order, accumulating into the left column. Switch the moment
  // adding the next item would tip the left column past half — that item
  // and all remaining items go right. This keeps reading order intact.
  // Always leave at least one item for the right column to avoid an empty
  // column when the very first item is huge.
  let leftH = 0;
  let splitIdx = features.length - 1; // default: everything but last → left
  for (let i = 0; i < features.length - 1; i++) {
    if (leftH + heights[i] > halfH) {
      splitIdx = i;
      break;
    }
    leftH += heights[i];
    splitIdx = i + 1;
  }

  // Guard: if the very first item alone exceeds half, the loop sets
  // splitIdx=0 → empty left column. Always keep at least one item on left.
  if (splitIdx === 0) splitIdx = 1;

  return {
    left: features.slice(0, splitIdx),
    right: features.slice(splitIdx),
  };
}

export function estimateCoverLayout(params: {
  overview: string | null | undefined;
  features: string[] | null | undefined;
  /** Target locale for rendering — picks per-locale metrics (font
   *  size, line-height, chars-per-line) to match what the translated
   *  preview will actually render. Defaults to English. */
  locale?: string;
}): CoverLayoutEstimate {
  const overview = params.overview ?? "";
  const features = (params.features ?? []) as string[];
  const m = metricsFor(params.locale);

  // Features: estimate per-column height using the same height-balancing
  // that the renderer now uses. Box height = taller of the two cols.
  const perItemLines = features.map((f) => countLines(f, m.featureCharsPerLine));
  const featuresTotalLines = perItemLines.reduce((s, n) => s + n, 0);

  const { left: leftItems, right: rightItems } = balanceFeatureColumns(features, params.locale);
  const heightOf = (items: string[]) =>
    items.reduce(
      (h, f) => h + countLines(f, m.featureCharsPerLine) * m.featureLineHeightPt + m.itemMarginPt,
      0,
    );
  const leftH = heightOf(leftItems);
  const rightH = heightOf(rightItems);
  const featuresContentHeight = Math.max(leftH, rightH);
  const featuresPerColLines = Math.ceil(featuresContentHeight / m.featureLineHeightPt);
  const featuresWantedHeight =
    features.length > 0 ? featuresContentHeight + FEATURES_CHROME : 0;
  const featuresHeight = Math.min(featuresWantedHeight, FEATURES_MAX_HEIGHT);
  const featuresCapped = featuresWantedHeight > FEATURES_MAX_HEIGHT;

  // Overview: bottom = features height + footer margin + gap (gap is
  // per-locale; CJK tighter to recover overflow space).
  const overviewBottom = COVER_FOOTER_MARGIN + featuresHeight + m.coverGapPt;
  const overviewSpaceAvailable = COVER_ZONE_HEIGHT - featuresHeight - m.coverGapPt;

  const overviewLines = countLines(overview, m.overviewCharsPerLine);
  // +25 = section-title height: 14pt font × ~1.2 line-height + 8pt margin
  const overviewWantedHeight = overviewLines * m.overviewLineHeightPt + 25;
  const overviewOverflow = overviewWantedHeight > overviewSpaceAvailable;

  return {
    featuresHeight,
    overviewBottom,
    overviewSpaceAvailable,
    overviewWantedHeight,
    overviewLines,
    featuresPerColLines,
    featuresTotalLines,
    featuresCapped,
    overviewOverflow,
    willOverflow: featuresCapped || overviewOverflow,
    featuresWantedHeight,
  };
}
