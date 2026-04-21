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
export const COVER_GAP = 20;               // visual gap between overview and features

// Features chrome = title (14pt + 10pt margin) + box vertical padding (18+18) = ~60pt
export const FEATURES_CHROME = 60;
export const FEATURES_MAX_HEIGHT = 320;    // hard cap — beyond this, it looks cramped

// Text metrics (conservative — slightly over-estimate to avoid under-counting)
export const LINE_HEIGHT_PT = 15;          // 11pt font × ~1.35 leading
export const ITEM_MARGIN_PT = 8;           // margin-bottom per feature item

// Column widths (in "char slots" — CJK chars count as 2) calibrated
// per-locale against visual verification. Japanese and Chinese use a
// slightly larger font (11.5pt / 12pt for overview vs English 11pt)
// and line-height is typically 1.5× for CJK vs 1.35× for Latin.
//
// English calibration points:
//   ECW201L-AC (600 char overview) overflows 201pt → needs 12 lines × 15pt + 25pt title = 205pt
//   ECS2528FP (430 char) fits 148pt → 8 lines × 15 = 145pt
//   ECC500 (728 char) fits 269pt → 14 lines × 15 = 235pt
//
// CJK estimates derived from typography (11.5pt JA / 12pt zh) in a
// 270pt overview column:
//   ja: 270/11.5 ≈ 23 CJK chars per line → 46 slots/line; line ≈ 17pt
//   zh-TW: 270/12 ≈ 22 CJK chars per line → 44 slots/line; line ≈ 18pt
export const OVERVIEW_WIDTH_CHARS = 54; // default (English)
export const FEATURE_COL_WIDTH_CHARS = 42;

export interface LocaleMetrics {
  overviewCharsPerLine: number;
  featureCharsPerLine: number;
  lineHeightPt: number;
  itemMarginPt: number;
}

export const LOCALE_METRICS: Record<string, LocaleMetrics> = {
  default: { overviewCharsPerLine: 54, featureCharsPerLine: 42, lineHeightPt: 15, itemMarginPt: 8 },
  ja: { overviewCharsPerLine: 46, featureCharsPerLine: 38, lineHeightPt: 17, itemMarginPt: 9 },
  "zh-TW": { overviewCharsPerLine: 44, featureCharsPerLine: 34, lineHeightPt: 18, itemMarginPt: 10 },
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
 * Distribute features across two columns by estimated HEIGHT rather than
 * by item count. A naive ceil(n/2) split puts 6 items left / 5 right, but
 * when item 4 is a 3-liner and items 5-6 are 1-liners, the left column
 * ends up much taller visually — exactly the ECW560 imbalance issue.
 *
 * Greedy bin-packing: walk items in order, assign each to whichever
 * column is currently shorter. Preserves reading order within each
 * column (but items may interleave across columns).
 */
export function balanceFeatureColumns(
  features: string[],
  locale?: string,
): {
  left: string[];
  right: string[];
} {
  const m = metricsFor(locale);
  const left: string[] = [];
  const right: string[] = [];
  let leftH = 0;
  let rightH = 0;

  for (const f of features) {
    const lines = countLines(f, m.featureCharsPerLine);
    const itemH = lines * m.lineHeightPt + m.itemMarginPt;
    if (leftH <= rightH) {
      left.push(f);
      leftH += itemH;
    } else {
      right.push(f);
      rightH += itemH;
    }
  }

  return { left, right };
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
      (h, f) => h + countLines(f, m.featureCharsPerLine) * m.lineHeightPt + m.itemMarginPt,
      0,
    );
  const leftH = heightOf(leftItems);
  const rightH = heightOf(rightItems);
  const featuresContentHeight = Math.max(leftH, rightH);
  const featuresPerColLines = Math.ceil(featuresContentHeight / m.lineHeightPt);
  const featuresWantedHeight =
    features.length > 0 ? featuresContentHeight + FEATURES_CHROME : 0;
  const featuresHeight = Math.min(featuresWantedHeight, FEATURES_MAX_HEIGHT);
  const featuresCapped = featuresWantedHeight > FEATURES_MAX_HEIGHT;

  // Overview: bottom = features height + footer margin + gap
  const overviewBottom = COVER_FOOTER_MARGIN + featuresHeight + COVER_GAP;
  const overviewSpaceAvailable = COVER_ZONE_HEIGHT - featuresHeight - COVER_GAP;

  const overviewLines = countLines(overview, m.overviewCharsPerLine);
  // +25 = section-title height: 14pt font × ~1.2 line-height + 8pt margin
  const overviewWantedHeight = overviewLines * m.lineHeightPt + 25;
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
