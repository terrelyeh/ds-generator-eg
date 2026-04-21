/**
 * Estimates whether a product's datasheet content will fit the PDF layout
 * or risk overflowing. Returns a traffic-light status for each content
 * category plus a list of specific offenders so the UI can tell the user
 * exactly what to shorten.
 */

import {
  AVAILABLE_HEIGHT,
  CATEGORY_HEADER_HEIGHT,
  estimateItemHeight,
  splitIntoPages,
} from "./pagination";

export type LayoutStatus = "ok" | "warn" | "overflow";

// ─── Thresholds ────────────────────────────────────────────────────────────

export const OVERVIEW_SAFE_CHARS = 500;  // comfortably fits ~5 lines
export const OVERVIEW_WARN_CHARS = 650;  // anything above this will overlap Features

export const FEATURES_SAFE_COUNT = 8;    // 4 per column × 2 columns
export const FEATURES_WARN_COUNT = 10;

export const FEATURE_ITEM_SAFE_CHARS = 90;    // 2 lines comfortably
export const FEATURE_ITEM_WARN_CHARS = 130;

export const SPEC_VALUE_SAFE_CHARS = 60;   // 1 line at 7pt in half-column
export const SPEC_VALUE_WARN_CHARS = 100;  // 2 lines OK; beyond = wraps 3+

// ─── Helpers ───────────────────────────────────────────────────────────────

function worst(a: LayoutStatus, b: LayoutStatus): LayoutStatus {
  const rank = { ok: 0, warn: 1, overflow: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
}

// ─── Cover page: Overview + Features & Benefits ─────────────────────────

export interface LongFeature {
  index: number;          // 1-based
  chars: number;
  preview: string;        // first ~40 chars for display
}

export interface CoverLayoutReport {
  status: LayoutStatus;
  /** Per-field status so UI can colour Overview / Features columns separately */
  overview_status: LayoutStatus;
  features_status: LayoutStatus;
  reasons: string[];
  metrics: {
    overview_chars: number;
    features_count: number;
    max_feature_chars: number;
  };
  /** Specific features that exceed the per-item length threshold */
  long_features: LongFeature[];
}

export function checkCoverLayout(params: {
  overview: string | null | undefined;
  features: string[] | null | undefined;
}): CoverLayoutReport {
  const overview = params.overview ?? "";
  const features = params.features ?? [];
  const overviewChars = overview.length;

  const reasons: string[] = [];

  // Overview status
  let overview_status: LayoutStatus = "ok";
  if (overviewChars > OVERVIEW_WARN_CHARS) {
    overview_status = "overflow";
    const excess = overviewChars - OVERVIEW_SAFE_CHARS;
    reasons.push(`Overview 過長 (${overviewChars} 字 / 建議 ≤ ${OVERVIEW_SAFE_CHARS})，需刪 ~${excess} 字`);
  } else if (overviewChars > OVERVIEW_SAFE_CHARS) {
    overview_status = "warn";
    const excess = overviewChars - OVERVIEW_SAFE_CHARS;
    reasons.push(`Overview 偏長 (${overviewChars} 字 / 建議 ≤ ${OVERVIEW_SAFE_CHARS})，再刪 ~${excess} 字更安全`);
  }

  // Features status
  let features_status: LayoutStatus = "ok";
  const long_features: LongFeature[] = [];

  if (features.length > FEATURES_WARN_COUNT) {
    features_status = "overflow";
    reasons.push(`Features 項目過多 (${features.length} / 建議 ≤ ${FEATURES_SAFE_COUNT})，需刪 ${features.length - FEATURES_SAFE_COUNT} 項`);
  } else if (features.length > FEATURES_SAFE_COUNT) {
    features_status = worst(features_status, "warn");
    reasons.push(`Features 項目偏多 (${features.length} / 建議 ≤ ${FEATURES_SAFE_COUNT})，再減 ${features.length - FEATURES_SAFE_COUNT} 項更安全`);
  }

  features.forEach((f, i) => {
    if (f.length > FEATURE_ITEM_WARN_CHARS) {
      features_status = "overflow";
      long_features.push({ index: i + 1, chars: f.length, preview: f.slice(0, 40) });
    } else if (f.length > FEATURE_ITEM_SAFE_CHARS) {
      features_status = worst(features_status, "warn");
      long_features.push({ index: i + 1, chars: f.length, preview: f.slice(0, 40) });
    }
  });

  if (long_features.length > 0) {
    const maxChars = Math.max(...long_features.map((f) => f.chars));
    reasons.push(`${long_features.length} 項 Feature 偏長 (最長 ${maxChars} 字 / 建議 ≤ ${FEATURE_ITEM_SAFE_CHARS})`);
  }

  const maxFeatureChars = features.reduce((m, f) => Math.max(m, f.length), 0);

  return {
    status: worst(overview_status, features_status),
    overview_status,
    features_status,
    reasons,
    metrics: {
      overview_chars: overviewChars,
      features_count: features.length,
      max_feature_chars: maxFeatureChars,
    },
    long_features,
  };
}

// ─── Spec pages: Technical Specifications ────────────────────────────────

export interface LongSpecItem {
  section: string;       // category name
  label: string;
  preview: string;       // first ~50 chars of value
  chars: number;
  estimated_lines: number;
}

export interface SpecLayoutReport {
  status: LayoutStatus;
  reasons: string[];
  metrics: {
    pages: number;
    max_column_fill_pct: number;
  };
  /** Specific spec values that wrap to many lines (≥ 3) */
  long_items: LongSpecItem[];
}

export function checkSpecLayout(
  sections: { category: string; items: { label: string; value: string }[] }[],
): SpecLayoutReport {
  if (!sections.length) {
    return {
      status: "ok",
      reasons: [],
      metrics: { pages: 0, max_column_fill_pct: 0 },
      long_items: [],
    };
  }

  const pages = splitIntoPages(sections);

  let worstFillPct = 0;
  for (const page of pages) {
    for (const column of [page.left, page.right]) {
      let h = 0;
      for (const section of column) {
        h += CATEGORY_HEADER_HEIGHT;
        for (const item of section.items) {
          h += estimateItemHeight(item.value);
        }
      }
      const pct = (h / AVAILABLE_HEIGHT) * 100;
      if (pct > worstFillPct) worstFillPct = pct;
    }
  }

  // Collect specific long items (warn threshold)
  const long_items: LongSpecItem[] = [];
  for (const section of sections) {
    for (const item of section.items) {
      const chars = item.value.length;
      if (chars > SPEC_VALUE_SAFE_CHARS) {
        // estimate lines: base 1 line + extras from estimateItemHeight
        const itemH = estimateItemHeight(item.value);
        // base row is 18pt (1 line); each extra line is 9pt
        const estimated_lines = Math.max(1, 1 + Math.round((itemH - 18) / 9));
        long_items.push({
          section: section.category,
          label: item.label,
          preview: item.value.slice(0, 50),
          chars,
          estimated_lines,
        });
      }
    }
  }

  // Sort by char count desc so worst offenders are first
  long_items.sort((a, b) => b.chars - a.chars);

  const reasons: string[] = [];
  let status: LayoutStatus = "ok";

  // NOTE: with the auto-split pagination (fitSection in pagination.ts),
  // long sections now flow to additional pages automatically. So fill%
  // is informational only — we only hard-flag spec as "overflow" when a
  // SINGLE spec value is so long it would dominate a page by itself.
  const hasVeryLongValue = long_items.some((it) => it.chars > SPEC_VALUE_WARN_CHARS * 2);
  if (hasVeryLongValue) {
    status = "overflow";
    reasons.push(`有 spec value 極長 (超過 ${SPEC_VALUE_WARN_CHARS * 2} 字)，可能單獨佔一整欄`);
  } else if (long_items.some((it) => it.chars > SPEC_VALUE_WARN_CHARS)) {
    status = "warn";
  }

  if (long_items.length > 0) {
    const worstChars = long_items[0].chars;
    reasons.push(`${long_items.length} 個 spec value 偏長 (最長 ${worstChars} 字 / 建議 ≤ ${SPEC_VALUE_SAFE_CHARS})，pagination 會自動多開頁但視覺上可能不理想`);
  }

  if (pages.length > 3) {
    // Too many pages = content is truly excessive
    if (status !== "overflow") status = "warn";
    reasons.push(`Spec 預估需要 ${pages.length} 頁 — 考慮精簡以減少頁數`);
  }

  return {
    status,
    reasons,
    metrics: {
      pages: pages.length,
      max_column_fill_pct: Math.round(worstFillPct),
    },
    long_items,
  };
}

// ─── Combined ─────────────────────────────────────────────────────────────

export interface LayoutReport {
  status: LayoutStatus;
  cover: CoverLayoutReport;
  spec: SpecLayoutReport;
}

export function checkProductLayout(params: {
  overview: string | null | undefined;
  features: string[] | null | undefined;
  spec_sections: { category: string; items: { label: string; value: string }[] }[];
}): LayoutReport {
  const cover = checkCoverLayout(params);
  const spec = checkSpecLayout(params.spec_sections);
  return {
    status: worst(cover.status, spec.status),
    cover,
    spec,
  };
}
