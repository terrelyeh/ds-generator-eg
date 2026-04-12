export interface TypographySettings {
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

export const TYPOGRAPHY_DEFAULTS: Record<string, TypographySettings> = {
  ja: {
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
