import { en } from "./en";
import { ja } from "./ja";
import { zhTW } from "./zh-TW";
import type { DatasheetDict, SupportedLocale } from "./types";

export type { DatasheetDict, SupportedLocale };
export { SUPPORTED_LOCALES } from "./types";

const dictionaries: Record<SupportedLocale, DatasheetDict> = {
  en,
  ja,
  "zh-TW": zhTW,
};

export function getDict(locale: string): DatasheetDict {
  return dictionaries[locale as SupportedLocale] ?? en;
}
