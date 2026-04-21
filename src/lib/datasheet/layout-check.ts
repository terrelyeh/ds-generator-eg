/**
 * Estimates whether a product's datasheet content will fit the PDF layout
 * or risk overflowing. Returns a traffic-light status for each content
 * category plus a list of specific offenders so the UI can tell the user
 * exactly what to shorten.
 */

import {
  AVAILABLE_HEIGHT,
  CATEGORY_HEADER_HEIGHT,
  SPEC_BASE_ROW_HEIGHT,
  SPEC_LINE_EXTRA,
  estimateItemHeight,
  splitIntoPages,
} from "./pagination";

/**
 * Binary status model: only "ok" (green, will fit) or "overflow" (red, will
 * break the PDF layout and needs PM action). The "warn" amber state was
 * removed because it caused decision paralysis — users couldn't tell if
 * they needed to act. With auto-split pagination handling long specs, the
 * only truly-breaking cases are on the absolute-positioned cover page.
 *
 * "warn" kept in the type for backward compat with older UI code but is
 * no longer emitted by this module.
 */
export type LayoutStatus = "ok" | "warn" | "overflow";

// ─── Thresholds (red = definitely breaks the PDF) ─────────────────────────

// Overview sits in a fixed-height slot above the absolute-positioned
// Features box. Beyond ~700 chars (≈6.5 lines at 11pt) the text starts
// overlapping the Features section below.
export const OVERVIEW_OVERFLOW_CHARS = 700;

// Features container is ~200pt tall with 2 columns. 10 items of normal
// length fit; 11+ gets clipped. Individual items > 150 chars wrap to 3+
// lines and break the 2-column balance so later items get pushed out.
export const FEATURES_OVERFLOW_COUNT = 10;
export const FEATURE_ITEM_OVERFLOW_CHARS = 150;

// Spec threshold kept for reporting long_items but NEVER triggers
// overflow — auto-split pagination handles all lengths by flowing to
// additional columns/pages.
export const SPEC_VALUE_LONG_CHARS = 100;

// Truly excessive content: more than 6 spec pages means the product has
// way too many spec rows, not a layout bug per se but worth flagging.
export const SPEC_EXCESSIVE_PAGES = 6;

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

  // Overview: red only if it will definitely overlap Features section below
  let overview_status: LayoutStatus = "ok";
  if (overviewChars > OVERVIEW_OVERFLOW_CHARS) {
    overview_status = "overflow";
    const excess = overviewChars - OVERVIEW_OVERFLOW_CHARS;
    reasons.push(
      `Overview 過長 (${overviewChars} 字 / 上限 ${OVERVIEW_OVERFLOW_CHARS})，會蓋到下方 Features — 需刪 ~${excess} 字`,
    );
  }

  // Features: red if count exceeds fixed-height container OR any single
  // item is so long it breaks the 2-column balance
  let features_status: LayoutStatus = "ok";
  const long_features: LongFeature[] = [];

  if (features.length > FEATURES_OVERFLOW_COUNT) {
    features_status = "overflow";
    reasons.push(
      `Features 項目過多 (${features.length} / 上限 ${FEATURES_OVERFLOW_COUNT})，最後幾項會被切掉 — 需刪 ${features.length - FEATURES_OVERFLOW_COUNT} 項`,
    );
  }

  features.forEach((f, i) => {
    if (f.length > FEATURE_ITEM_OVERFLOW_CHARS) {
      features_status = "overflow";
      long_features.push({ index: i + 1, chars: f.length, preview: f.slice(0, 40) });
    }
  });

  if (long_features.length > 0) {
    const maxChars = Math.max(...long_features.map((f) => f.chars));
    reasons.push(
      `${long_features.length} 項 Feature 過長 (最長 ${maxChars} 字 / 上限 ${FEATURE_ITEM_OVERFLOW_CHARS})，會破壞雙欄排版`,
    );
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

  // Collect long items for reporting (informational — spec never goes red
  // from these because auto-split + mid-item splitting handles all lengths)
  const long_items: LongSpecItem[] = [];
  for (const section of sections) {
    for (const item of section.items) {
      const chars = item.value.length;
      if (chars > SPEC_VALUE_LONG_CHARS) {
        const itemH = estimateItemHeight(item.value);
        const estimated_lines = Math.max(
          1,
          1 + Math.round((itemH - SPEC_BASE_ROW_HEIGHT) / SPEC_LINE_EXTRA),
        );
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

  long_items.sort((a, b) => b.chars - a.chars);

  const reasons: string[] = [];
  let status: LayoutStatus = "ok";

  // With auto-split pagination + mid-item value splitting (see
  // fitSection + splitValueAtLines in pagination.ts), long specs NEVER
  // break layout — they just flow to more columns/pages. The only thing
  // worth flagging red is absurdly excessive content that balloons page
  // count beyond a reasonable datasheet length.
  if (pages.length > SPEC_EXCESSIVE_PAGES) {
    status = "overflow";
    reasons.push(
      `Spec 內容過多 (預估 ${pages.length} 頁 / 上限 ${SPEC_EXCESSIVE_PAGES}) — 考慮精簡`,
    );
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
