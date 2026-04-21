/**
 * Estimates whether a product's datasheet content will fit the PDF layout
 * or risk overflowing. Returns a traffic-light status for:
 *   - cover: Overview + Features & Benefits on page 1
 *   - spec:  Technical Specifications across the 2-column layout
 *
 * The estimates are conservative heuristics (no DOM measurement). They're
 * good enough to surface "this product is going to look bad" warnings in
 * the UI before someone generates the PDF.
 */

import {
  AVAILABLE_HEIGHT,
  CATEGORY_HEADER_HEIGHT,
  estimateItemHeight,
  splitIntoPages,
} from "./pagination";

export type LayoutStatus = "ok" | "warn" | "overflow";

// ─── Cover page: Overview + Features & Benefits ─────────────────────────

// Cover page geometry (from preview page CSS):
//   Overview box starts at top:270pt, width:270pt, so it grows down.
//   Features wrapper anchors to bottom:36pt, full width (36pt left/right).
//   Between them there's ~some gap — we budget the page area this way:
//     Overview vertical budget: 792 - 270 - 36 (top bar already accounted) = ~320pt
//     Features vertical budget: ~380pt from bottom up
//   When Overview + Features together need > ~450pt of stacked vertical
//   space they start colliding.

const OVERVIEW_SAFE_CHARS = 500; // ~5 lines of 11pt text in 270pt column
const OVERVIEW_WARN_CHARS = 650;

const FEATURES_SAFE_COUNT = 8;   // 4 per column × 2 columns
const FEATURES_WARN_COUNT = 10;

const FEATURE_ITEM_SAFE_CHARS = 90;   // fits in 2 lines comfortably
const FEATURE_ITEM_WARN_CHARS = 130;

export interface CoverLayoutReport {
  status: LayoutStatus;
  reasons: string[];
  metrics: {
    overview_chars: number;
    features_count: number;
    max_feature_chars: number;
  };
}

export function checkCoverLayout(params: {
  overview: string | null | undefined;
  features: string[] | null | undefined;
}): CoverLayoutReport {
  const overview = params.overview ?? "";
  const features = params.features ?? [];
  const overviewChars = overview.length;
  const maxFeatureChars = features.reduce((m, f) => Math.max(m, f.length), 0);

  let status: LayoutStatus = "ok";
  const reasons: string[] = [];

  if (overviewChars > OVERVIEW_WARN_CHARS) {
    status = "overflow";
    reasons.push(`Overview 字數過多 (${overviewChars} chars)`);
  } else if (overviewChars > OVERVIEW_SAFE_CHARS) {
    if (status === "ok") status = "warn";
    reasons.push(`Overview 偏長 (${overviewChars} chars)`);
  }

  if (features.length > FEATURES_WARN_COUNT) {
    status = "overflow";
    reasons.push(`Features 項目過多 (${features.length} items)`);
  } else if (features.length > FEATURES_SAFE_COUNT) {
    if (status === "ok") status = "warn";
    reasons.push(`Features 項目偏多 (${features.length} items)`);
  }

  if (maxFeatureChars > FEATURE_ITEM_WARN_CHARS) {
    status = "overflow";
    reasons.push(`某項 Feature 過長 (${maxFeatureChars} chars)`);
  } else if (maxFeatureChars > FEATURE_ITEM_SAFE_CHARS) {
    if (status === "ok") status = "warn";
    reasons.push(`某項 Feature 偏長 (${maxFeatureChars} chars)`);
  }

  return {
    status,
    reasons,
    metrics: {
      overview_chars: overviewChars,
      features_count: features.length,
      max_feature_chars: maxFeatureChars,
    },
  };
}

// ─── Spec pages: Technical Specifications ────────────────────────────────

export interface SpecLayoutReport {
  status: LayoutStatus;
  reasons: string[];
  metrics: {
    pages: number;
    max_column_fill_pct: number; // worst-case column fill across all pages
  };
}

export function checkSpecLayout(
  sections: { category: string; items: { label: string; value: string }[] }[],
): SpecLayoutReport {
  if (!sections.length) {
    return {
      status: "ok",
      reasons: [],
      metrics: { pages: 0, max_column_fill_pct: 0 },
    };
  }

  const pages = splitIntoPages(sections);

  let worstFillPct = 0;
  const reasons: string[] = [];

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

  let status: LayoutStatus = "ok";
  if (worstFillPct > 100) {
    status = "overflow";
    reasons.push(`Spec 某欄位預估超過頁面 (${worstFillPct.toFixed(0)}%)`);
  } else if (worstFillPct > 90) {
    status = "warn";
    reasons.push(`Spec 接近頁面上限 (${worstFillPct.toFixed(0)}%)`);
  }

  return {
    status,
    reasons,
    metrics: {
      pages: pages.length,
      max_column_fill_pct: Math.round(worstFillPct),
    },
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

  // Overall = worst of the two
  const rank: Record<LayoutStatus, number> = { ok: 0, warn: 1, overflow: 2 };
  const worst: LayoutStatus =
    rank[cover.status] >= rank[spec.status] ? cover.status : spec.status;

  return {
    status: worst,
    cover,
    spec,
  };
}
