import React from "react";
import { PrintToolbar } from "@/components/preview/print-toolbar";
import { getDict } from "@/lib/datasheet/locales";
import type {
  Product,
  ProductLine,
  SpecSection,
  SpecItem,
} from "@eg/db/types";

/**
 * DATA CENTER per-model datasheet — navy layout traced from the
 * "EnGenius-Data-Center-Servers_v1.0" reference PDF (2-in-1 design adapted
 * to per-model per the 2026-07-23 decisions):
 *
 *   1. Cover — navy hero (white headline + YELLOW model + overview +
 *      product shot; no interior photo) + chip-style grouped features
 *      (products.ds_features; falls back to flat features)
 *   2. EDCC — shared management-platform page (static asset rendered from
 *      the reference PDF; zero PM work)
 *   3..n. Technical Specifications — FULL-WIDTH single-model table
 *      (blue band + dark Model Name/Number bands + alternating rows),
 *      paginated by estimated row height
 *   n+1. Hardware Overview — 1–2 renders ({model}_hardware[_2].png) +
 *      Contact-Us footer (Transceiver-style QR)
 *
 *   Letter size. Shared by BOTH Data Center lines (Edge Network
 *   Appliance / AI Server). EN-only for now.
 */

const NAVY = "#16355c";
const BLUE = "#0073bf";
const YELLOW = "#f4d768";

/**
 * EDCC page copy — live text (was baked into a page image, which made the
 * type sizes fight the rest of the datasheet). Only the screenshots and
 * their callouts stay as images. Wording follows the reference PDF, with
 * "EAS Series Servers" generalised since this page is shared by BOTH Data
 * Center lines, and the stray space in "license- free" fixed.
 */
const EDCC_INTRO =
  "The EnGenius Data Center Controller (EDCC) is the cornerstone of simplified, " +
  "efficient management for your EnGenius data center servers. This powerful, " +
  "license-free platform provides comprehensive out-of-band management capabilities, " +
  "empowering IT teams with unparalleled control and visibility over their entire " +
  "server fleet from a single interface.";

const EDCC_FEATURES: { title: string; text: string }[] = [
  {
    title: "Simplified Firmware Updates",
    text: "Push unified firmware updates to multiple servers simultaneously, ensuring consistency and reducing maintenance overhead.",
  },
  {
    title: "Visual POD View",
    text: "Gain a physical-to-logical view of server groupings with intuitive POD visualization, enabling more efficient resource mapping, configuration, and infrastructure monitoring.",
  },
  {
    title: "Out-of-Band Control",
    text: "Manage servers even if the operating system is unresponsive or powered off, ensuring continuous uptime and remote troubleshooting.",
  },
  {
    title: "Remote Diagnostics & Troubleshooting",
    text: "Gain real-time insights into server health, performance metrics, and system logs, enabling proactive issue identification and rapid resolution from anywhere.",
  },
  {
    title: "Unified Device Management",
    text: "Centralized control over all EnGenius servers, eliminating the need for individual server access.",
  },
  {
    title: "Scalable Deployment",
    text: "Designed to manage a growing number of servers, providing seamless scalability as your data center expands.",
  },
];

interface DcQueryRow extends Product {
  product_lines: ProductLine;
  spec_sections: (SpecSection & { spec_items: SpecItem[] })[];
}

/** Rough line count for a spec value in the 385pt value column (8pt Roboto). */
function estLines(text: string, charsPerLine: number): number {
  return text
    .split("\n")
    .reduce((sum, seg) => sum + Math.max(1, Math.ceil(seg.trim().length / charsPerLine)), 0);
}

// ── Cover hero auto-fit ──────────────────────────────────────────────
// The hero band is a fixed height, but PM-written overviews vary a lot
// (SE110's ran 11 lines and ate the band's entire bottom padding). Rather
// than hand-tuning per model, estimate the rendered height and step the
// overview down a size ladder until it fits with clearance.
const HERO_HEIGHT = 335;
const HERO_PAD_TOP = 26;
const HERO_PAD_BOTTOM = 20;
const HEADLINE_SIZE = 24;
const HEADLINE_LINE_HEIGHT = 1.28;
const HEADLINE_WIDTH = 520;
const PRODUCT_COL = 268;     // right-hand render column
const COPY_WIDTH = 272;      // hero inner width − gap − PRODUCT_COL
const MODEL_BLOCK = 27;      // model line + its margin
const LOWER_GAP = 14;        // .hero-lower margin-top
const OVERVIEW_LINE_HEIGHT = 1.55;
/**
 * Average glyph advance as a fraction of font size. CALIBRATED against
 * rendered PDFs (five models, observed lines vs character counts) — an
 * earlier guess of 0.586 over-counted lines by ~10% and pushed the copy
 * two steps down the ladder for no reason. Manrope Medium (headline) runs
 * wider than the Light body copy.
 */
const BODY_WIDTH_FACTOR = 0.531;
const HEADLINE_WIDTH_FACTOR = 0.6;

/** Estimated wrapped line count for `text` in a column of `columnWidth`. */
function estWrappedLines(text: string, size: number, columnWidth: number, widthFactor: number): number {
  const charsPerLine = Math.max(1, Math.floor(columnWidth / (widthFactor * size)));
  return text
    .split("\n")
    .reduce((sum, seg) => sum + Math.max(1, Math.ceil(seg.trim().length / charsPerLine)), 0);
}

/**
 * Largest size from the ladder whose estimated block fits `available`.
 * The ladder is deliberately narrow (1pt spread) so the five datasheets in
 * the family still look like siblings; anything that can't fit at the
 * floor means the PM's overview is too long for a cover and should be cut
 * rather than shrunk further.
 */
function fitOverviewSize(overview: string, available: number): number {
  const ladder = [10, 9.5, 9];
  for (const size of ladder) {
    const height =
      estWrappedLines(overview, size, COPY_WIDTH, BODY_WIDTH_FACTOR) * size * OVERVIEW_LINE_HEIGHT;
    if (height <= available - 8) return size;
  }
  return ladder[ladder.length - 1];
}

interface SpecRow {
  label: string;
  value: string;
}

/** Split flat spec rows into pages by estimated height. */
function paginateSpecRows(rows: SpecRow[], firstPageBudget: number, restPageBudget: number): SpecRow[][] {
  const pages: SpecRow[][] = [];
  let current: SpecRow[] = [];
  let used = 0;
  let budget = firstPageBudget;
  for (const row of rows) {
    const h = Math.max(estLines(row.value, 86), estLines(row.label, 24)) * 11 + 11;
    if (used + h > budget && current.length > 0) {
      pages.push(current);
      current = [];
      used = 0;
      budget = restPageBudget;
    }
    current.push(row);
    used += h;
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

function Placeholder({ slot, className }: { slot: string; className?: string }) {
  return <div className={`img-placeholder ${className ?? ""}`}>missing: {slot}</div>;
}

export function DataCenterPreview({
  product,
  showToolbar,
  userRole,
  versionOverride,
}: {
  product: DcQueryRow;
  showToolbar: boolean;
  userRole: import("@eg/auth/permissions").Role | null;
  versionOverride: string | null;
}) {
  const dict = getDict("en");
  const line = product.product_lines;

  // Grouped features (chip | bold title + bullets); fall back to flat list.
  const dsGroups = (product.ds_features ?? []).filter(
    (g) => g && (g.title || g.bullets.length > 0)
  );
  const useGroups = dsGroups.length > 0;

  // Flat spec rows — the DC table renders without category headers (the
  // sheets carry a single implicit section; the reference design has none).
  const specRows: SpecRow[] = (product.spec_sections ?? [])
    .sort((a, b) => a.sort_order - b.sort_order)
    .flatMap((s) =>
      (s.spec_items ?? [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((i) => ({ label: i.label, value: i.value }))
    )
    .filter((r) => r.value.trim() !== "" && r.value.trim().toUpperCase() !== "N/A");

  // First spec page: title(70) + band(22) + 2 model bands(40) → ~600pt of rows.
  const specPages = paginateSpecRows(specRows, 590, 655);

  const hw1 = product.hardware_image && !product.hardware_image.startsWith("cache/")
    ? product.hardware_image : null;
  const hw2 = product.hardware_image_2 && !product.hardware_image_2.startsWith("cache/")
    ? product.hardware_image_2 : null;
  const productImage = product.product_image && !product.product_image.startsWith("cache/")
    ? product.product_image : null;

  // QR — Transceiver treatment: per-line template else Contact Us.
  const plExt = line as ProductLine & { qr_url_template?: string | null };
  const qrUrl = (plExt.qr_url_template || "https://www.engeniustech.com/contact-us")
    .replace("{model}", product.model_name.toLowerCase());
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrUrl)}`;

  // Auto-fit the hero overview to whatever room the headline leaves.
  const heroHeadline = product.headline || product.full_name;
  const headlineHeight =
    estWrappedLines(heroHeadline, HEADLINE_SIZE, HEADLINE_WIDTH, HEADLINE_WIDTH_FACTOR) *
    HEADLINE_SIZE *
    HEADLINE_LINE_HEIGHT;
  const overviewSize = fitOverviewSize(
    product.overview ?? "",
    HERO_HEIGHT - HERO_PAD_TOP - HERO_PAD_BOTTOM - headlineHeight - LOWER_GAP - MODEL_BLOCK,
  );

  const version = versionOverride || product.current_version || "1.0";
  const today = new Date().toLocaleDateString(dict.dateLocale, {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });

  const canGenerate =
    !!productImage &&
    !!hw1 &&
    !!product.overview && product.overview.trim().length > 0 &&
    (useGroups || (Array.isArray(product.features) && product.features.length > 0)) &&
    specRows.length > 0;

  const totalPages = 2 + specPages.length + 1;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <>
      {showToolbar && (
        <PrintToolbar
          model={product.model_name}
          currentVersion={product.current_version || "0.0"}
          canGenerate={canGenerate}
          locale="en"
          userRole={userRole}
          translationConfirmed
        />
      )}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@200;300;400;500;600;700&family=Roboto:wght@300;400;500;700&display=swap');

@page { size: letter; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  color-adjust: exact !important;
}
body {
  font-family: 'Roboto', sans-serif;
  color: #525355;
  font-size: 8pt;
  line-height: 1.4;
  background: #e0e0e0;
  padding-top: ${showToolbar ? "48px" : "0"};
}
@media print {
  html, body { padding: 0 !important; margin: 0 !important; background: white !important; min-height: 0 !important; }
  .page { box-shadow: none !important; margin: 0 !important; page-break-after: always; page-break-inside: avoid; }
  .page:last-of-type { page-break-after: auto; }
  .print-toolbar { display: none !important; }
}
.page {
  width: 612pt; height: 792pt;
  position: relative; overflow: hidden;
  page-break-after: always;
  background: white;
  margin: 20px auto;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

/* slim navy strip on continuation pages */
.top-bar { background: ${NAVY}; height: 21.4pt; width: 100%; }

.page-number {
  position: absolute; right: 24pt; bottom: 16pt;
  font-family: 'Manrope', sans-serif; font-weight: 200;
  font-size: 7pt; color: #58595b;
}

.section-title {
  font-family: 'Manrope', sans-serif; font-weight: 300;
  font-size: 17pt; color: ${BLUE};
}

.img-placeholder {
  border: 1pt dashed #b9bfc4; background: #f8f9fa; color: #9aa3ab;
  display: flex; align-items: center; justify-content: center;
  font-size: 8pt;
}

/* ── Cover ─────────────────────────────────────────────────────────────
   Geometry traced from the reference PDF's cover (its page is 613×860, so
   vertical values are scaled ×0.921 to Letter). Key traits of that layout:
   a TALL solid header band, an oversized ExtraLight headline, the yellow
   model line, Manrope body copy, and a wide product render sitting just
   below the hero's centre. */
.cover-header {
  position: absolute; top: 0; left: 0; right: 0; height: 100pt;
  background: ${BLUE};
}
.cover-header .logo-img {
  position: absolute; left: 36pt; top: 50%; transform: translateY(-50%); height: 27pt;
}
.cover-header .solution-label {
  position: absolute; right: 36pt; top: 50%; transform: translateY(-50%);
  font-family: 'Manrope', sans-serif; font-weight: 200; font-size: 14pt; color: white;
}
/* Reference structure: full-width headline across the top, then a row of
   copy (left) beside the product render (right). FLOW, not fixed offsets —
   headlines run 2 or 3 lines depending on the model and fixed tops made a
   3-line headline collide with the model line. */
.hero {
  position: absolute; top: 100pt; left: 0; right: 0; height: ${HERO_HEIGHT}pt;
  background: linear-gradient(118deg, #10294a 0%, ${NAVY} 40%, #1c4d84 74%, ${BLUE} 122%);
  overflow: hidden;
  padding: ${HERO_PAD_TOP}pt 20pt ${HERO_PAD_BOTTOM}pt 36pt;
}
/* Headline + model carry weight; the overview stays light so the
   hierarchy still reads (all-bold would flatten the block). */
.hero-headline {
  font-family: 'Manrope', sans-serif; font-weight: 500;
  font-size: ${HEADLINE_SIZE}pt; line-height: ${HEADLINE_LINE_HEIGHT};
  color: white; max-width: ${HEADLINE_WIDTH}pt;
}
.hero-lower { display: flex; gap: 16pt; margin-top: ${LOWER_GAP}pt; }
.hero-copy { flex: 1 1 auto; min-width: 0; max-width: ${COPY_WIDTH}pt; }
.hero-model {
  font-family: 'Manrope', sans-serif; font-weight: 600;
  font-size: 15pt; color: ${YELLOW}; margin-bottom: 8pt;
}
.hero-overview {
  font-family: 'Manrope', sans-serif; font-weight: 300;
  line-height: ${OVERVIEW_LINE_HEIGHT}; color: rgba(255,255,255,0.95);
}
/* Wide render column; flat 1U units fill the width, taller chassis the
   height. Centres against the copy block beside it. */
.hero-product-box {
  flex: 0 0 ${PRODUCT_COL}pt;
  display: flex; align-items: center; justify-content: center;
}
.hero-product-box img { max-width: 100%; max-height: 180pt; object-fit: contain; }
.hero-product-ph {
  width: 100%; height: 130pt;
  background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.45);
  color: rgba(255,255,255,0.6);
}

/* features under the hero — chip groups, 2 columns × 3 rows.
   Fixed height + space-between spreads the rows down the WHOLE lower
   half instead of stacking them at the top with dead space beneath. */
.cover-features {
  position: absolute; top: ${100 + HERO_HEIGHT + 24}pt; left: 36pt; right: 36pt;
  height: ${792 - (100 + HERO_HEIGHT + 24) - 38}pt;
  display: grid; grid-template-columns: 1fr 1fr; column-gap: 26pt;
  align-content: space-between;
}
.feature-chip {
  display: inline-block; background: ${BLUE}; color: white;
  font-weight: 500; font-size: 8pt; padding: 1.5pt 7pt; margin-bottom: 4pt;
}
.feature-title {
  font-weight: 700; font-size: 10.5pt; color: #3f4042; margin-bottom: 3pt;
  line-height: 1.3;
}
.feature-text { font-weight: 400; font-size: 7.5pt; color: #525355; line-height: 1.5; }
.feature-text .fb { margin-bottom: 3pt; }
/* flat fallback (no ds_features): plain bullet list, two columns */
.cover-features-flat {
  position: absolute; top: 440pt; left: 36pt; right: 36pt;
  column-count: 2; column-gap: 28pt;
}
.flat-bullet {
  display: flex; gap: 5pt; break-inside: avoid;
  font-size: 8.5pt; color: #525355; line-height: 1.55; margin-bottom: 5pt;
}
.flat-bullet .dot { color: ${BLUE}; flex: none; }

/* ── EDCC shared page ──────────────────────────────────────────────── */
/* Copy is LIVE TEXT (crisp at any zoom, editable); only the product
   screenshots + their callouts come from the reference PDF as images. */
.edcc-page { position: absolute; top: 21.4pt; left: 36pt; right: 36pt; padding-top: 22pt; }
.edcc-intro {
  font-size: 8pt; line-height: 1.6; color: #525355; margin: 8pt 0 14pt;
}
.edcc-visual { display: flex; justify-content: center; }
.edcc-visual img { width: 492pt; object-fit: contain; }
.edcc-visual.panels { margin-top: 10pt; }
.edcc-features {
  display: grid; grid-template-columns: 1fr 1fr; gap: 16pt 26pt; margin-top: 22pt;
}
.edcc-feature { border-left: 2pt solid ${BLUE}; padding-left: 8pt; }
.edcc-feature-title {
  font-size: 10pt; font-weight: 400; color: #231f20; margin-bottom: 3pt;
}
.edcc-feature-text { font-size: 7.5pt; line-height: 1.5; color: #525355; }

/* ── Technical specifications ─────────────────────────────────────── */
.specs-page { position: absolute; top: 21.4pt; left: 36pt; right: 36pt; }
.specs-title-row { padding: 22pt 0 14pt; }
.specs-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.specs-table col.label-col { width: 132pt; }
.specs-table td, .specs-table th {
  border: 0.5pt solid #d9d9d9; vertical-align: middle;
  padding: 4.5pt 8pt; text-align: left;
}
.specs-band th {
  background: ${BLUE}; color: white; font-weight: 400; font-size: 8.5pt;
  text-align: center; padding: 5pt; border-color: ${BLUE};
}
.model-name-row td { background: #6d6e71; color: white; font-size: 8pt; }
.model-number-row td { background: #939598; color: white; font-size: 8pt; }
.model-name-row td:first-child, .model-number-row td:first-child { text-align: left; }
.spec-row td { font-size: 8pt; line-height: 1.4; }
.spec-row td.spec-label { color: #231f20; font-weight: 400; }
.spec-row td.spec-value { color: #525355; white-space: pre-line; }
.spec-row:nth-child(even) td { background: #eff0f0; }

/* ── Hardware overview ─────────────────────────────────────────────── */
.hw-page { position: absolute; top: 21.4pt; left: 36pt; right: 36pt; }
.hw-title-row { padding: 22pt 0 4pt; }
.hw-subtitle { font-size: 10.5pt; color: #231f20; font-weight: 400; margin-bottom: 10pt; }
/* Two renders share the page evenly (one per half) rather than stacking
   at the top; a single render centres in the whole area. */
.hw-images {
  display: flex; flex-direction: column; align-items: center;
  height: 596pt; justify-content: space-around;
}
.hw-images img { max-width: 500pt; max-height: 270pt; object-fit: contain; }
.hw-images.single { justify-content: center; }
.hw-images.single img { max-height: 400pt; }
.hw-ph { width: 440pt; height: 220pt; }

/* ── Footer (last page) ────────────────────────────────────────────── */
.footer {
  position: absolute; bottom: 0; left: 0; right: 0;
  background: #eff0f2; padding: 14pt 36pt 20pt 36pt;
}
.footer-content { display: table; width: 100%; }
.footer-left { display: table-cell; vertical-align: top; padding-right: 30pt; }
.footer-right { display: table-cell; vertical-align: bottom; width: 75pt; text-align: center; }
.footer-logo { margin-bottom: 6pt; }
.footer-logo img { height: 17pt; }
.footer-disclaimer { font-weight: 300; font-size: 5.5pt; color: #6d6e71; line-height: 1.45; }
.footer-version { font-weight: 300; font-size: 5.5pt; color: #6d6e71; margin-top: 4pt; }
.footer-qr { background: white; padding: 2pt 2pt 5pt 2pt; display: inline-block; }
.footer-qr img { width: 41pt; height: 41pt; display: block; }
.footer-qr-label { font-weight: 400; font-size: 7pt; color: #6b7580; margin-top: 2pt; }
`,
        }}
      />

      {/* ═══ PAGE 1 — COVER ═══ */}
      <div className="page">
        <div className="cover-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-img" src="/logo/EnGenius-Logo-white.png" alt="EnGenius" />
          <span className="solution-label">Data Center Solution</span>
        </div>
        <div className="hero">
          <div className="hero-headline">{product.headline || product.full_name}</div>
          <div className="hero-lower">
            <div className="hero-copy">
              <div className="hero-model">{product.model_name}</div>
              <div className="hero-overview" style={{ fontSize: `${overviewSize}pt` }}>
              {product.overview}
            </div>
            </div>
            <div className="hero-product-box">
              {productImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={productImage} alt={product.model_name} />
              ) : (
                <Placeholder slot={`${product.model_name}_product.png`} className="hero-product-ph" />
              )}
            </div>
          </div>
        </div>

        {useGroups ? (
          <div className="cover-features">
            {dsGroups.slice(0, 8).map((g, gi) => {
              const [chip, ...rest] = g.title.split("|");
              const boldTitle = rest.length > 0 ? rest.join("|").trim() : "";
              return (
                <div key={gi}>
                  <div className="feature-chip">{chip.trim()}</div>
                  {boldTitle && <div className="feature-title">{boldTitle}</div>}
                  <div className="feature-text">
                    {g.bullets.map((b, bi) => (
                      <div key={bi} className="fb">{b}</div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="cover-features-flat">
            {(product.features ?? []).map((f, fi) => (
              <div key={fi} className="flat-bullet">
                <span className="dot">●</span>
                <span>{f}</span>
              </div>
            ))}
          </div>
        )}

        <div className="page-number">{pad(1)}</div>
      </div>

      {/* ═══ PAGE 2 — EDCC (shared across all Data Center lines) ═══ */}
      <div className="page">
        <div className="top-bar" />
        <div className="edcc-page">
          <span className="section-title">
            EnGenius Data Center Controller Centralized Management
          </span>
          <div className="edcc-intro">{EDCC_INTRO}</div>
          <div className="edcc-visual">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/datacenter/edcc-dashboard.png" alt="EDCC dashboard" />
          </div>
          <div className="edcc-visual panels">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/datacenter/edcc-panels.png" alt="EDCC node and POD views" />
          </div>
          <div className="edcc-features">
            {EDCC_FEATURES.map((f) => (
              <div key={f.title} className="edcc-feature">
                <div className="edcc-feature-title">{f.title}</div>
                <div className="edcc-feature-text">{f.text}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="page-number">{pad(2)}</div>
      </div>

      {/* ═══ TECHNICAL SPECIFICATIONS (paginated) ═══ */}
      {specPages.map((rows, pi) => (
        <div key={pi} className="page">
          <div className="top-bar" />
          <div className="specs-page">
            <div className="specs-title-row">
              <span className="section-title">Technical Specifications</span>
            </div>
            <table className="specs-table">
              <colgroup>
                <col className="label-col" />
                <col />
              </colgroup>
              {pi === 0 && (
                <thead>
                  <tr className="specs-band">
                    <th colSpan={2}>EnGenius {line.name}</th>
                  </tr>
                </thead>
              )}
              <tbody>
                {pi === 0 && (
                  <>
                    <tr className="model-name-row">
                      <td>Model Name</td>
                      <td>{product.subtitle}</td>
                    </tr>
                    <tr className="model-number-row">
                      <td>Model Number</td>
                      <td>{product.model_name}</td>
                    </tr>
                  </>
                )}
                {rows.map((r, ri) => (
                  <tr key={ri} className="spec-row">
                    <td className="spec-label">{r.label}</td>
                    <td className="spec-value">{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="page-number">{pad(3 + pi)}</div>
        </div>
      ))}

      {/* ═══ HARDWARE OVERVIEW + FOOTER ═══ */}
      <div className="page">
        <div className="top-bar" />
        <div className="hw-page">
          <div className="hw-title-row">
            <span className="section-title">Hardware Overview</span>
          </div>
          <div className="hw-subtitle">
            {product.model_name} ({product.subtitle})
          </div>
          <div className={`hw-images${hw2 ? "" : " single"}`}>
            {hw1 ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={hw1} alt={`${product.model_name} hardware`} />
            ) : (
              <Placeholder slot={`${product.model_name}_hardware.png`} className="hw-ph" />
            )}
            {hw2 && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={hw2} alt={`${product.model_name} hardware rear`} />
            )}
          </div>
        </div>

        <div className="footer">
          <div className="footer-content">
            <div className="footer-left">
              <div className="footer-logo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo/EnGenius-Logo-gray.png" alt="EnGenius" />
              </div>
              <div className="footer-disclaimer">{dict.disclaimer}</div>
              <div className="footer-version">
                Version {version} &nbsp; {today}
              </div>
            </div>
            <div className="footer-right">
              <div className="footer-qr">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCodeUrl} alt="QR Code" />
              </div>
              <div className="footer-qr-label">Contact Us</div>
            </div>
          </div>
        </div>

        <div className="page-number">{pad(totalPages)}</div>
      </div>
    </>
  );
}
