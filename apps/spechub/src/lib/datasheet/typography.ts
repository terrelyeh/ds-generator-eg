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

/** Google Fonts suitable for each locale */
export const FONT_OPTIONS: Record<string, { value: string; label: string; import: string }[]> = {
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

export const TYPOGRAPHY_DEFAULTS: Record<string, TypographySettings> = {
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
