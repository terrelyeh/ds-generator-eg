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
import { estimateCoverLayout, FEATURES_MAX_HEIGHT } from "./cover-layout";

/**
 * Binary status model: only "ok" (green, will fit) or "overflow" (red,
 * will break the PDF layout and needs PM action). The amber "warn" state
 * was removed — users couldn't tell if action was required.
 *
 * With dynamic cover layout (see cover-layout.ts) matching the manual
 * designer's workflow, red only fires when content exceeds the physical
 * page zone even after dynamic resizing.
 */
export type LayoutStatus = "ok" | "warn" | "overflow";

// ─── Thresholds ────────────────────────────────────────────────────────────

// Per-feature visual-break threshold: a single feature > 180 chars wraps
// to 4+ lines at 11pt, which breaks the 2-column balance even if total
// height is within limits. Separate from the combined-height check.
export const FEATURE_ITEM_OVERFLOW_CHARS = 180;

// Spec threshold kept for reporting long_items (informational only).
// Auto-split pagination handles any length by flowing to more pages.
export const SPEC_VALUE_LONG_CHARS = 100;

// Truly excessive spec content: beyond this many pages it's a data
// problem, not a layout bug.
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
  const long_features: LongFeature[] = [];

  // Dynamic layout estimate — same algorithm the PDF cover uses.
  // Red fires only when even after dynamic resizing, content would get
  // clipped on the page.
  const layout = estimateCoverLayout({ overview, features });

  let overview_status: LayoutStatus = "ok";
  let features_status: LayoutStatus = "ok";

  if (layout.featuresCapped) {
    features_status = "overflow";
    const excessPt = layout.featuresWantedHeight - FEATURES_MAX_HEIGHT;
    const approxItemsToCut = Math.ceil(excessPt / 25); // ~25pt per single-line item
    reasons.push(
      `Features 超過版面上限 (需 ${layout.featuresWantedHeight}pt / 上限 ${FEATURES_MAX_HEIGHT}pt) — 建議刪 ~${approxItemsToCut} 項或縮短文字`,
    );
  }

  if (layout.overviewOverflow) {
    overview_status = "overflow";
    const excessPt = layout.overviewWantedHeight - layout.overviewSpaceAvailable;
    const approxCharsToCut = Math.ceil((excessPt / 15) * 38); // ~38 chars/line
    reasons.push(
      `Overview 擠不進剩餘空間 (需 ${layout.overviewWantedHeight}pt / 剩 ${layout.overviewSpaceAvailable}pt — 因為 Features 佔用 ${layout.featuresHeight}pt) — 建議刪 ~${approxCharsToCut} 字`,
    );
  }

  // Per-item visual-break rule (independent of total height): a single
  // feature that wraps to 4+ lines looks wrong even if total fits.
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
