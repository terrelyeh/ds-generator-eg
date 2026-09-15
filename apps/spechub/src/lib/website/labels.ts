import type { Status } from "./compare";
import type { DocLanguage } from "./parse";

/** What each status is called on screen and in copied issue lists. */
export const STATUS_LABEL: Record<Status, string> = {
  ok: "已是最新",
  push: "待推送",
  todo: "待上架",
  diff: "檔案不同",
  newer: "站上較新",
  prodnewer: "正式站較新",
  same: "一致",
  notyet: "還沒做",
  mismatch: "不一致",
  nopage: "無產品頁",
  fail: "查詢失敗",
  skip: "不比對",
  wrong_model: "掛錯型號",
};

export type StatusTone = "good" | "info" | "warn" | "bad" | "muted";

export const STATUS_TONE: Record<Status, StatusTone> = {
  ok: "good",
  same: "good",
  push: "info",
  todo: "warn",
  notyet: "warn",
  newer: "warn",
  prodnewer: "warn",
  diff: "bad",
  mismatch: "bad",
  fail: "bad",
  wrong_model: "bad",
  skip: "muted",
  nopage: "muted",
};

/** How SpecHub names a language in its own UI, for the baseline chips. */
export const SPECHUB_LANGUAGE: Record<DocLanguage, string> = { en: "English", ja: "日本語", zh: "繁體中文" };
