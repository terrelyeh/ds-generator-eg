/**
 * The shared type scale for every datasheet layout.
 *
 * The four layouts drifted to 16 distinct sizes and 6 weights because there
 * was no standard to deviate from: `typography.ts` served only the standard
 * layout, and Data Center / Broadband / Edge AI each hardcoded their own
 * numbers traced from a different InDesign reference. The tell is that the
 * only roles already identical across all four — page number, footer,
 * running header — are the ones with no source PDF behind them.
 *
 * So this file is the standard. Each layout still decides WHICH step a role
 * uses (that is a real design choice: a cover headline is 24pt everywhere,
 * but Broadband's dense benefit grid legitimately sits lower than the
 * standard layout's ten-item feature list). What it can no longer do is
 * invent 17.5 because one reference PDF happened to use it.
 *
 * Adding a step is a deliberate act — if a layout needs a size that is not
 * here, that is a conversation about the scale, not a local edit.
 */

/** Type steps, in points. */
export const PT = {
  /** Cover headline. */
  cover: 24,
  /** Cover subtitle, and the larger section-title treatment. */
  lead: 17,
  /** Running-header category, and the smaller section-title treatment. */
  head: 14,
  /** Running-header prefix, cover model number. */
  label: 12,
  /** Primary running copy — the standard layout's overview and features. */
  body: 11,
  /** Secondary running copy — dense feature grids, compact overviews. */
  bodySm: 9,
  /** Spec tables, category bands. */
  table: 8,
  /** Spec labels and values where the table is two-column; page numbers. */
  tableSm: 7,
  /** Footer disclaimer. */
  footer: 5.5,
} as const;

/**
 * Weights. 200 is gone — it existed only for Data Center's solution label
 * and page number, and read as a different design language from the same
 * roles in the other three layouts.
 */
export const WT = {
  light: 300,
  regular: 400,
  medium: 500,
  semi: 600,
  bold: 700,
} as const;

/**
 * Auto-fit ladders, kept as an explicit exception.
 *
 * Data Center and Broadband step their cover overview down until it fits a
 * fixed band. That solves real overflow on PM-written copy of unpredictable
 * length, so the ladders stay — but their rungs are scale steps now, and
 * the intermediate rung matters: dropping straight from `body` to `bodySm`
 * is a visible 2pt jump on an otherwise identical-looking cover.
 */
export const LADDER = {
  /** Data Center cover overview. */
  dcOverview: [PT.body, 10, PT.bodySm] as number[],
  /** Broadband per-model cover overview. */
  broadbandOverview: [PT.bodySm, 8.5, PT.table] as number[],
} as const;

/**
 * Broadband's cover headline switches down when the copy is long enough to
 * wrap past the band. Same reasoning as the ladders: a mechanism, not a
 * style choice.
 */
export const BROADBAND_HEADLINE = {
  max: PT.cover,
  long: PT.lead,
  /** Characters above which the headline drops to `long`. */
  threshold: 46,
} as const;
