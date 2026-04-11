export interface DatasheetDict {
  /** Top bar: "Datasheet |" */
  datasheet: string;
  /** Cover page section title */
  overview: string;
  /** Cover page section title */
  featuresAndBenefits: string;
  /** Spec pages title */
  technicalSpecifications: string;
  /** Last page title */
  hardwareOverview: string;
  /** QR code label (default, can be overridden per-product) */
  defaultQrLabel: string;
  /** QR code URL pattern (default, can be overridden per-product). Use {model} as placeholder */
  defaultQrUrl: string;
  /** Footer legal disclaimer */
  disclaimer: string;
  /** Date locale for toLocaleDateString (e.g. "en-US", "ja-JP") */
  dateLocale: string;
  /** Bullet character for feature lists */
  bullet: string;
}

export type SupportedLocale = "en" | "ja" | "zh-TW";

export const SUPPORTED_LOCALES: { value: SupportedLocale; label: string; flag: string }[] = [
  { value: "en", label: "English", flag: "\u{1F1FA}\u{1F1F8}" },
  { value: "ja", label: "Japanese", flag: "\u{1F1EF}\u{1F1F5}" },
  { value: "zh-TW", label: "Traditional Chinese", flag: "\u{1F1F9}\u{1F1FC}" },
];
