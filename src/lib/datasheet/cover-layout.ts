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

// Column widths (in "char slots" — CJK chars count as 2). Calibrated
// from real feedback on auto-generated PDFs:
//   ECC500 (728 chars overview) → fits 224pt space ≈ 13 lines actual
//   ECS1528P (459 chars) → fits 186pt space ≈ 8 lines actual
//   ECW201L-AC (740 chars) → 小超標 201pt space (needs ~13 lines)
// Roboto is narrower than typical proportional fonts; real wrap ≈ 60
// Latin chars per line in a 270pt column. Features column (~228pt) gets
// ~42 chars/line from observed ESG output where estimate matched reality
// (349pt wanted vs 320pt cap = 29pt over = "小跑版").
export const OVERVIEW_WIDTH_CHARS = 60;
export const FEATURE_COL_WIDTH_CHARS = 42;

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

export function estimateCoverLayout(params: {
  overview: string | null | undefined;
  features: string[] | null | undefined;
}): CoverLayoutEstimate {
  const overview = params.overview ?? "";
  const features = (params.features ?? []) as string[];

  // Features: estimate total wrap lines, split roughly evenly across 2 cols.
  // Per-column height is what determines box height (taller col wins).
  const perItemLines = features.map((f) => countLines(f, FEATURE_COL_WIDTH_CHARS));
  const featuresTotalLines = perItemLines.reduce((s, n) => s + n, 0);
  const featuresPerColLines = Math.ceil(featuresTotalLines / 2);
  const featuresPerColItems = Math.ceil(features.length / 2);

  const featuresContentHeight =
    featuresPerColLines * LINE_HEIGHT_PT + featuresPerColItems * ITEM_MARGIN_PT;
  const featuresWantedHeight =
    features.length > 0 ? featuresContentHeight + FEATURES_CHROME : 0;
  const featuresHeight = Math.min(featuresWantedHeight, FEATURES_MAX_HEIGHT);
  const featuresCapped = featuresWantedHeight > FEATURES_MAX_HEIGHT;

  // Overview: bottom = features height + footer margin + gap
  const overviewBottom = COVER_FOOTER_MARGIN + featuresHeight + COVER_GAP;
  const overviewSpaceAvailable = COVER_ZONE_HEIGHT - featuresHeight - COVER_GAP;

  const overviewLines = countLines(overview, OVERVIEW_WIDTH_CHARS);
  // +25 = section-title height: 14pt font × ~1.2 line-height + 8pt margin
  const overviewWantedHeight = overviewLines * LINE_HEIGHT_PT + 25;
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
