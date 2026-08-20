/**
 * Layout registry for project datasheets.
 *
 * The catalogue derives its look from what a product IS — `getTheme()` in
 * preview/[model]/page.tsx switches on the product category, because a Cloud
 * AP is blue and that isn't a choice anyone makes per document. Project
 * datasheets are the opposite: the product doesn't have a line yet, and the
 * look is picked per deal. So the layout is a stored field, chosen in the
 * editor, resolved through this table.
 *
 * Adding a look = adding an entry. Adding a genuinely different LAYOUT (not
 * just a palette) = adding an entry plus a component, with `component` telling
 * the preview route which to render. Only 'series-matrix' exists today; the
 * field is here so the second one doesn't require touching every call site.
 *
 * ⚠️ These palettes are SAMPLED FROM, not shared with, the catalogue layouts.
 * A project datasheet must never be able to change how a live product
 * datasheet prints, which is exactly what importing colours out of
 * broadband-preview.tsx would eventually cause. Divergence here is cheap;
 * a coupled regression on a shipping datasheet is not.
 */

export interface ProjectTheme {
  /** shown in the layout picker */
  label: string;
  /** which renderer draws it */
  component: "series-matrix";
  /** headings, section titles, the cover band */
  primary: string;
  /** cover band background */
  headerBg: string;
  /** the dark bar above the spec table */
  bandDark: string;
  /** the lighter bar carrying the model names */
  bandLight: string;
  /** zebra striping on spec rows */
  rowAlt: string;
  /** tint behind the features/benefits blocks */
  featuresBox: string;
}

export const PROJECT_LAYOUTS: Record<string, ProjectTheme> = {
  /**
   * Steel blue. The default because it's the palette of the Broadband EOC
   * series sheet, which is the catalogue's only multi-model comparison
   * document — so a two-column tender sheet in steel reads as an EnGenius
   * document of the right KIND, not just the right brand.
   */
  steel: {
    label: "Steel Blue (outdoor / broadband)",
    component: "series-matrix",
    primary: "#1e6796",
    headerBg: "#1e6796",
    bandDark: "#6c6d71",
    bandLight: "#888b8d",
    rowAlt: "#eff0f0",
    featuresBox: "#eef3f7",
  },
  cloud: {
    label: "EnGenius Blue (cloud-managed)",
    component: "series-matrix",
    primary: "#03a9f4",
    headerBg: "#03a9f4",
    bandDark: "#6c6d71",
    bandLight: "#888b8d",
    rowAlt: "#f0fafe",
    featuresBox: "#ebf8fe",
  },
  navy: {
    label: "Station Navy (outdoor sub-brand)",
    component: "series-matrix",
    primary: "#3a4d78",
    headerBg: "#445c88",
    bandDark: "#555e6e",
    bandLight: "#7d869a",
    rowAlt: "#f0f2f6",
    featuresBox: "#f0f2f6",
  },
  datacenter: {
    label: "Data Center Navy",
    component: "series-matrix",
    primary: "#16355c",
    headerBg: "#16355c",
    bandDark: "#0073bf",
    bandLight: "#4a90c9",
    rowAlt: "#eef2f7",
    featuresBox: "#eef2f7",
  },
  graphite: {
    label: "Graphite (unmanaged / neutral)",
    component: "series-matrix",
    primary: "#58595B",
    headerBg: "#58595B",
    bandDark: "#6c6d71",
    bandLight: "#888b8d",
    rowAlt: "#f2f2f2",
    featuresBox: "#f2f2f2",
  },
};

export const DEFAULT_LAYOUT = "steel";

export function getProjectTheme(key: string | null | undefined): ProjectTheme {
  return PROJECT_LAYOUTS[key ?? ""] ?? PROJECT_LAYOUTS[DEFAULT_LAYOUT];
}

/** Options for the editor's layout picker. */
export function layoutOptions(): { value: string; label: string }[] {
  return Object.entries(PROJECT_LAYOUTS).map(([value, t]) => ({ value, label: t.label }));
}

/**
 * The Preliminary notice a new project datasheet starts with.
 *
 * Editable afterwards — the DB only enforces that it isn't blank. `{customer}`
 * is substituted at creation, not at render, so editing the customer field
 * later doesn't silently rewrite wording someone approved.
 */
export function defaultDisclaimer(customer?: string | null): string {
  const who = customer?.trim() ? ` for ${customer.trim()}` : "";
  return (
    `PRELIMINARY — Prepared${who}. Specifications are subject to change ` +
    `without notice and do not constitute a commitment to supply.`
  );
}

/** The note that rides under stand-in hardware renders. */
export const DEFAULT_IMAGE_NOTE =
  "Product image is representative; final appearance may differ.";
