export interface TypographySettings {
  font_family: string;
  headline_size: number;
  headline_weight: number;
  subtitle_size: number;
  overview_size: number;
  overview_weight: number;
  features_size: number;
  features_weight: number;
  spec_label_size: number;
  spec_label_weight: number;
  spec_value_weight: number;
  footer_size: number;
  section_title_size: number;
  letter_spacing: number;
  text_color: string;
}

/**
 * Locales that need their own webfont and their own type metrics.
 *
 * Per-locale typography exists because CJK needs a different face, larger
 * body sizes and taller leading than the Latin default. Latin locales
 * (en, es) render in Roboto with the English metrics and must NOT get a
 * TYPOGRAPHY_DEFAULTS entry — see the warning on cjkFontFor().
 *
 * Keep this list explicit. It used to be inferred from "does this locale
 * have a TYPOGRAPHY_DEFAULTS entry", which silently made any new locale
 * with defaults a CJK locale (same class of bug as pitfall #61).
 */
export const CJK_LOCALES = new Set(["ja", "zh-TW"]);

export function isCjkLocale(locale: string | null | undefined): boolean {
  return !!locale && CJK_LOCALES.has(locale);
}

/** Google Fonts suitable for each locale */
export const FONT_OPTIONS: Record<string, { value: string; label: string; import: string }[]> = {
  // Latin faces. Roboto is what every datasheet has always been set in —
  // the alternatives are here so the face is a choice rather than a code
  // change, not because anything is expected to move off Roboto.
  en: [
    { value: "Roboto", label: "Roboto (default)", import: "Roboto" },
    { value: "Inter", label: "Inter", import: "Inter" },
    { value: "Open Sans", label: "Open Sans", import: "Open+Sans" },
    { value: "Lato", label: "Lato", import: "Lato" },
    { value: "Source Sans 3", label: "Source Sans 3", import: "Source+Sans+3" },
  ],
  es: [
    { value: "Roboto", label: "Roboto (default)", import: "Roboto" },
    { value: "Inter", label: "Inter", import: "Inter" },
    { value: "Open Sans", label: "Open Sans", import: "Open+Sans" },
    { value: "Lato", label: "Lato", import: "Lato" },
    { value: "Source Sans 3", label: "Source Sans 3", import: "Source+Sans+3" },
  ],
  ja: [
    { value: "Zen Kaku Gothic New", label: "Zen Kaku Gothic New", import: "Zen+Kaku+Gothic+New" },
    { value: "Noto Sans JP", label: "Noto Sans JP", import: "Noto+Sans+JP" },
    { value: "M PLUS 1p", label: "M PLUS 1p", import: "M+PLUS+1p" },
    { value: "M PLUS 2", label: "M PLUS 2", import: "M+PLUS+2" },
    { value: "BIZ UDGothic", label: "BIZ UDGothic", import: "BIZ+UDGothic" },
    { value: "IBM Plex Sans JP", label: "IBM Plex Sans JP", import: "IBM+Plex+Sans+JP" },
    { value: "Murecho", label: "Murecho", import: "Murecho" },
    { value: "Kiwi Maru", label: "Kiwi Maru (rounded)", import: "Kiwi+Maru" },
  ],
  "zh-TW": [
    { value: "Noto Sans TC", label: "Noto Sans TC", import: "Noto+Sans+TC" },
    { value: "Zen Old Mincho", label: "Zen Old Mincho", import: "Zen+Old+Mincho" },
    { value: "LXGW WenKai TC", label: "LXGW WenKai TC", import: "LXGW+WenKai+TC" },
  ],
};

/**
 * Per-locale type metrics for the standard (Cloud-skeleton) layout.
 *
 * en/es carry the values that used to be hardcoded in the layout's CSS, so
 * adding them here changes no output — it only makes them editable. What is
 * NOT here is leading, body colour and footer treatment: those differ by
 * script family rather than by locale, and the renderer picks them from
 * isCjkLocale(). Exposing them per locale would let someone give Spanish
 * CJK leading, which is exactly how a cover overflows.
 *
 * Only this layout reads these. Data Center, Broadband and Edge AI set
 * their own type in their own components.
 */
export const TYPOGRAPHY_DEFAULTS: Record<string, TypographySettings> = {
  en: {
    font_family: "Roboto",
    headline_size: 24,
    headline_weight: 500,
    subtitle_size: 19,
    overview_size: 11,
    overview_weight: 400,
    features_size: 11,
    features_weight: 400,
    spec_label_size: 7,
    spec_label_weight: 500,
    spec_value_weight: 300,
    footer_size: 5.5,
    section_title_size: 14,
    letter_spacing: 0,
    text_color: "#6f6f6f",
  },
  // Spanish renders in the English metrics deliberately: the cover budget is
  // enforced by line parity in the translation prompt, not by shrinking type.
  es: {
    font_family: "Roboto",
    headline_size: 24,
    headline_weight: 500,
    subtitle_size: 19,
    overview_size: 11,
    overview_weight: 400,
    features_size: 11,
    features_weight: 400,
    spec_label_size: 7,
    spec_label_weight: 500,
    spec_value_weight: 300,
    footer_size: 5.5,
    section_title_size: 14,
    letter_spacing: 0,
    text_color: "#6f6f6f",
  },
  ja: {
    font_family: "Zen Kaku Gothic New",
    headline_size: 24,
    headline_weight: 500,
    subtitle_size: 17,
    overview_size: 11.5,
    overview_weight: 500,
    features_size: 10.5,
    features_weight: 500,
    spec_label_size: 7,
    spec_label_weight: 600,
    spec_value_weight: 400,
    footer_size: 6,
    section_title_size: 13,
    letter_spacing: 0.5,
    text_color: "#444444",
  },
  "zh-TW": {
    font_family: "Noto Sans TC",
    headline_size: 24,
    headline_weight: 600,
    subtitle_size: 17,
    overview_size: 12,
    overview_weight: 500,
    features_size: 11,
    features_weight: 500,
    spec_label_size: 7,
    spec_label_weight: 600,
    spec_value_weight: 400,
    footer_size: 6,
    section_title_size: 13,
    letter_spacing: 0.3,
    text_color: "#444444",
  },
};

/** Field labels for the UI */
export const TYPOGRAPHY_FIELDS: { key: keyof TypographySettings; label: string; unit: string; type: "size" | "weight" | "color" }[] = [
  { key: "headline_size", label: "Headline", unit: "pt", type: "size" },
  { key: "headline_weight", label: "Headline Weight", unit: "", type: "weight" },
  { key: "subtitle_size", label: "Subtitle", unit: "pt", type: "size" },
  { key: "overview_size", label: "Overview", unit: "pt", type: "size" },
  { key: "overview_weight", label: "Overview Weight", unit: "", type: "weight" },
  { key: "features_size", label: "Features", unit: "pt", type: "size" },
  { key: "features_weight", label: "Features Weight", unit: "", type: "weight" },
  { key: "spec_label_size", label: "Spec Label", unit: "pt", type: "size" },
  { key: "spec_label_weight", label: "Spec Label Weight", unit: "", type: "weight" },
  { key: "spec_value_weight", label: "Spec Value Weight", unit: "", type: "weight" },
  { key: "section_title_size", label: "Section Title", unit: "pt", type: "size" },
  { key: "footer_size", label: "Footer", unit: "pt", type: "size" },
  { key: "letter_spacing", label: "Letter Spacing", unit: "pt", type: "size" },
  { key: "text_color", label: "Text Color", unit: "", type: "color" },
];

export const WEIGHT_OPTIONS = [300, 400, 500, 600, 700];

/** Group fields for visual separation in the UI */
export const TYPOGRAPHY_GROUPS: { label: string; fields: (keyof TypographySettings)[] }[] = [
  { label: "Headline", fields: ["headline_size", "headline_weight", "subtitle_size"] },
  { label: "Overview", fields: ["overview_size", "overview_weight"] },
  { label: "Features", fields: ["features_size", "features_weight"] },
  { label: "Specifications", fields: ["spec_label_size", "spec_label_weight", "spec_value_weight", "section_title_size"] },
  { label: "Footer & Misc", fields: ["footer_size", "letter_spacing", "text_color"] },
];

/** Parse a Google Fonts URL to extract font family name and import slug */
export function parseGoogleFontUrl(url: string): { value: string; label: string; import: string } | null {
  // Match: https://fonts.google.com/specimen/Noto+Sans+JP
  // or: https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@...
  let slug: string | null = null;

  const specimenMatch = url.match(/fonts\.google\.com\/specimen\/([^?&/]+)/);
  if (specimenMatch) slug = specimenMatch[1];

  const cssMatch = url.match(/family=([^:&]+)/);
  if (cssMatch) slug = cssMatch[1];

  if (!slug) return null;

  const name = decodeURIComponent(slug.replace(/\+/g, " "));
  return { value: name, label: name, import: slug };
}

/**
 * Resolve the CJK webfont for a locale, for layouts that set their own
 * font-family rather than consuming the full TypographySettings.
 *
 * Roboto — the Latin face the Broadband and Data Center layouts are drawn
 * in — has no CJK glyphs, so a ja datasheet rendered as a page of tofu
 * boxes. Latin-only locales get `null` and keep their own stack untouched.
 *
 * Returns the Google Fonts URL to @import plus the family to put in FRONT
 * of the layout's own stack, so Latin text still renders in Roboto and only
 * CJK falls through to the CJK face.
 *
 * ⚠️ Gated on CJK_LOCALES, not on "has a TYPOGRAPHY_DEFAULTS entry". Those
 * were the same thing until `es` arrived; had this kept inferring, giving
 * Spanish a defaults entry would have pushed Roboto ahead of Manrope in the
 * Data Center layout and quietly restyled that datasheet.
 */
export function cjkFontFor(
  locale: string,
  override?: string | null,
): { importUrl: string; family: string } | null {
  if (!isCjkLocale(locale)) return null;

  const defaults = TYPOGRAPHY_DEFAULTS[locale];
  if (!defaults) return null;

  const family = override || defaults.font_family;
  const slug =
    (FONT_OPTIONS[locale] ?? []).find((f) => f.value === family)?.import ??
    family.replace(/\s+/g, "+");

  return {
    importUrl: `https://fonts.googleapis.com/css2?family=${slug}:wght@300;400;500;600;700&display=swap`,
    family,
  };
}
