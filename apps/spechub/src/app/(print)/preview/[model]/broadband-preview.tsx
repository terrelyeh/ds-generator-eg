import React from "react";
import { PrintToolbar } from "@/components/preview/print-toolbar";
import { getDict } from "@/lib/datasheet/locales";
import { radioPatternSlots } from "@/lib/datasheet/radio-patterns";
import type { Product, ProductLine, SpecSection, SpecItem, ImageAsset } from "@eg/db/types";

/**
 * BROADBAND OUTDOOR datasheet — steel-blue layout traced from
 * "DS Broadband EOC Series_v1.5" (Letter, Roboto).
 *
 * The reference is a SERIES document whose first two pages are entirely
 * line-level and whose later pages are per-model slices of the same
 * material — so one renderer serves both scopes:
 *
 * The two scopes answer different questions, so their first two pages
 * differ deliberately — otherwise the PDFs are near-indistinguishable:
 *
 *   series   p1 line headline + "EOC Series" + shared marketing blocks
 *            p2 the generic Features & Benefits list + deployment diagram
 *   model    p1 THIS model's headline, number, overview and key features
 *            p2 "Why the <series>" — the shared blocks, demoted to context
 *
 * (The line-level benefits list is the generic phrasing of the same points
 * each product spells out with real numbers, so a per-model sheet showing
 * both would just repeat itself.)
 *
 *   page 3+ specs        per-model table  |  series comparison table
 *   page n  product views  per-model callout renders
 *   page n  antenna patterns  band or port plots (radio-patterns.ts)
 *
 * `scope: "model"` renders one product; `scope: "series"` renders the whole
 * line. Pages 1–2 come from line_datasheets either way, so the two PDFs
 * can never drift apart.
 */

const STEEL = "#1e6796";
const BAND_DARK = "#6c6d71";
const BAND_LIGHT = "#888b8d";
const ROW_ALT = "#eff0f0";
/** Key Features that fit the per-model cover column; the rest roll to p2. */
const COVER_FEATURE_LIMIT = 7;

export interface LineContent {
  headline: string | null;
  series_name: string | null;
  category_label: string | null;
  features: { title: string; bullets: string[] }[];
  benefits: string[];
  footnote: string | null;
  current_version: string | null;
}

interface BroadbandProduct extends Product {
  spec_sections: (SpecSection & { spec_items: SpecItem[] })[];
  image_assets: ImageAsset[];
}

function Placeholder({ slot, className }: { slot: string; className?: string }) {
  return <div className={`img-ph ${className ?? ""}`}>missing: {slot}</div>;
}

/** ~chars per line in a spec value column of `width` pt at 7pt Roboto. */
function estRows(text: string, width: number): number {
  const perLine = Math.max(8, Math.floor(width / (0.5 * 7)));
  return text
    .split("\n")
    .reduce((n, seg) => n + Math.max(1, Math.ceil(seg.trim().length / perLine)), 0);
}

interface SpecRow {
  label: string;
  /** one value per column (1 for per-model, N for series) */
  values: string[];
}

function paginate(rows: SpecRow[], valueWidth: number, first: number, rest: number): SpecRow[][] {
  const pages: SpecRow[][] = [];
  let cur: SpecRow[] = [];
  let used = 0;
  let budget = first;
  for (const r of rows) {
    const lines = Math.max(
      estRows(r.label, 96),
      ...r.values.map((v) => estRows(v, valueWidth)),
    );
    const h = lines * 9.6 + 8;
    if (used + h > budget && cur.length) {
      pages.push(cur);
      cur = [];
      used = 0;
      budget = rest;
    }
    cur.push(r);
    used += h;
  }
  if (cur.length) pages.push(cur);
  return pages;
}

export function BroadbandPreview({
  scope,
  line,
  lineContent,
  products,
  focusModel,
  showToolbar,
  userRole,
  versionOverride,
}: {
  scope: "model" | "series";
  line: ProductLine;
  lineContent: LineContent | null;
  /** scope="model": just that product. scope="series": the whole line. */
  products: BroadbandProduct[];
  /** the product being rendered when scope="model" */
  focusModel: BroadbandProduct | null;
  showToolbar: boolean;
  userRole: import("@eg/auth/permissions").Role | null;
  versionOverride: string | null;
}) {
  const dict = getDict("en");
  const isSeries = scope === "series";

  // Cover identity: the series speaks for the family, a model speaks for
  // itself.
  const coverHeadline = isSeries
    ? lineContent?.headline || line.label
    : focusModel?.headline || lineContent?.headline || line.label;
  const headline = lineContent?.headline || focusModel?.headline || line.label;
  const modelOverview = focusModel?.overview?.trim() ?? "";
  const modelFeatures = (focusModel?.features ?? []).filter(Boolean);
  const seriesName = lineContent?.series_name || line.label;
  const categoryLabel = lineContent?.category_label || line.label;
  const blocks = lineContent?.features ?? [];
  const benefits = lineContent?.benefits ?? [];
  const footnote = lineContent?.footnote ?? null;

  // ── spec table ──────────────────────────────────────────────────────
  // Per-model: one value column. Series: one column per product, rows
  // unioned across models so a spec present on only some models still
  // shows (blank cells where it doesn't apply).
  // Reference datasheet leads with the access points, then the CPEs;
  // plain alphabetical order puts EOC600 first, which reads backwards.
  const orderedProducts = isSeries
    ? [...products].sort((a, b) => {
        const cpe = (p: BroadbandProduct) =>
          /\bCPE\b/i.test(`${p.subtitle ?? ""} ${p.full_name ?? ""}`) ? 1 : 0;
        return cpe(a) - cpe(b) || a.model_name.localeCompare(b.model_name);
      })
    : products;
  const columns = isSeries ? orderedProducts : focusModel ? [focusModel] : [];
  const rowOrder: string[] = [];
  const rowMap = new Map<string, Map<string, string>>();
  for (const p of columns) {
    for (const sec of [...(p.spec_sections ?? [])].sort((a, b) => a.sort_order - b.sort_order)) {
      for (const item of [...(sec.spec_items ?? [])].sort((a, b) => a.sort_order - b.sort_order)) {
        if (!rowMap.has(item.label)) {
          rowMap.set(item.label, new Map());
          rowOrder.push(item.label);
        }
        rowMap.get(item.label)!.set(p.model_name, item.value);
      }
    }
  }
  const specRows: SpecRow[] = rowOrder
    .map((label) => ({
      label,
      values: columns.map((p) => rowMap.get(label)?.get(p.model_name) ?? ""),
    }))
    .filter((r) => r.values.some((v) => v.trim() && v.trim().toUpperCase() !== "N/A"))
    // These already ride the dark header bands above the table body.
    .filter((r) => !/^model\s*(name|#|number)/i.test(r.label.trim()));

  const valueWidth = isSeries ? Math.max(70, 440 / Math.max(1, columns.length)) : 440;
  const specPages = paginate(specRows, valueWidth, 560, 640);

  // ── per-model pages ─────────────────────────────────────────────────
  const viewProducts = isSeries ? orderedProducts : focusModel ? [focusModel] : [];
  const productViews = viewProducts.map((p) => {
    const ext = p as BroadbandProduct & { hardware_image_2?: string | null };
    const shots = [p.hardware_image, ext.hardware_image_2]
      .filter((u): u is string => !!u && !u.startsWith("cache/"));
    return { product: p, shots };
  });

  const antennaPages = viewProducts
    .map((p) => {
      const slots = radioPatternSlots({
        category: line.category,
        subtitle: p.subtitle,
        fullName: p.full_name,
        specSections: (p.spec_sections ?? []).map((s) => ({
          category: s.category,
          items: (s.spec_items ?? []).map((i) => ({ label: i.label, value: i.value })),
        })),
      });
      const plots = slots.map((slot) => {
        const a = (p.image_assets ?? []).find(
          (x) => x.image_type === "radio_pattern" && x.label === slot.label,
        );
        const url = a && a.status !== "missing" && a.file_url ? a.file_url : null;
        return { ...slot, url };
      });
      return { product: p, plots };
    })
    // Keep the page whenever the product defines slots — missing plots show
    // placeholders (same as Product Views) so PMs can see what's expected.
    .filter((x) => x.plots.length > 0);

  // ── footer / QR ─────────────────────────────────────────────────────
  const plExt = line as ProductLine & { qr_url_template?: string | null };
  const qrTarget = (plExt.qr_url_template || "https://www.engeniustech.com/contact-us").replace(
    "{model}",
    (focusModel?.model_name ?? line.name).toLowerCase(),
  );
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrTarget)}`;

  const currentVersion = isSeries
    ? lineContent?.current_version ?? "0.0"
    : focusModel?.current_version ?? "0.0";
  const version = versionOverride || (currentVersion !== "0.0" ? currentVersion : "1.0");
  const today = new Date().toLocaleDateString(dict.dateLocale, {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });

  const heroImg = "/broadband/eoc-hero.png";
  const deployImg = "/broadband/eoc-deployment.png";

  const canGenerate =
    blocks.length > 0 &&
    benefits.length > 0 &&
    specRows.length > 0 &&
    productViews.every((v) => v.shots.length > 0) &&
    antennaPages.every((a) => a.plots.every((plot) => plot.url));

  let pageNo = 0;
  const nextPage = () => ++pageNo;

  // The footer rides the LAST page, whatever that turns out to be —
  // antenna plots are optional, and product views only exist once the PM
  // uploads renders, so it can't be pinned to any one section.
  const Footer = () => (
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
  );
  const lastSection =
    antennaPages.length > 0 ? "antenna" : productViews.length > 0 ? "views" : "specs";
  const totalPages =
    2 + specPages.length + productViews.length + antennaPages.length;

  return (
    <>
      {showToolbar && (
        <PrintToolbar
          model={isSeries ? line.name : focusModel?.model_name ?? line.name}
          currentVersion={currentVersion}
          canGenerate={canGenerate}
          locale="en"
          userRole={userRole}
          translationConfirmed
          series={isSeries}
        />
      )}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap');
@page { size: letter; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
body {
  font-family: 'Roboto', sans-serif; color: #6f6f6f; font-size: 8pt;
  line-height: 1.4; background: #e0e0e0;
  padding-top: ${showToolbar ? "48px" : "0"};
}
@media print {
  html, body { padding: 0 !important; margin: 0 !important; background: white !important; }
  .page { box-shadow: none !important; margin: 0 !important; page-break-after: always; page-break-inside: avoid; }
  .page:last-of-type { page-break-after: auto; }
  .print-toolbar { display: none !important; }
}
.page {
  width: 612pt; height: 792pt; position: relative; overflow: hidden;
  page-break-after: always; background: white; margin: 20px auto;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
.top-bar { background: ${STEEL}; height: 21pt; width: 100%; }
.page-number {
  position: absolute; right: 27pt; bottom: 18pt;
  font-weight: 300; font-size: 7pt; color: #6f7073;
}
.section-title {
  font-weight: 500; font-size: 14pt; color: ${STEEL};
}
.img-ph {
  border: 1pt dashed #b9bfc4; background: #f8f9fa; color: #9aa3ab;
  display: flex; align-items: center; justify-content: center; font-size: 8pt;
}

/* ── cover ─────────────────────────────────────────────────────────── */
.cover-header {
  position: absolute; top: 0; left: 0; right: 0; height: 96pt; background: ${STEEL};
}
.cover-header .logo-img {
  position: absolute; left: 36pt; top: 50%; transform: translateY(-50%); height: 27pt;
}
.cover-header .ds-label {
  position: absolute; right: 36pt; top: 50%; transform: translateY(-50%);
  font-size: 12pt; font-weight: 300; color: white;
}
.cover-header .ds-label strong { font-weight: 500; font-size: 14pt; }
/* The reference hero art is cropped BELOW its baked-in headline, so the
   live title sits in its own band above the photo (same steel blue, so it
   reads as one block). */
.hero {
  position: absolute; top: 96pt; left: 0; right: 0; height: 359pt;
  overflow: hidden; background: ${STEEL};
}
.hero-titles {
  position: absolute; top: 0; left: 37pt; right: 37pt; height: 104pt;
  padding-top: 20pt;
}
.hero img {
  position: absolute; top: 104pt; left: 0; right: 0; bottom: 0;
  width: 100%; height: 255pt; object-fit: cover;
}
.hero-title { font-weight: 500; color: white; line-height: 1.18; }
.hero-series { font-weight: 400; font-size: 15pt; color: white; margin-top: 4pt; }
.cover-blocks {
  position: absolute; top: 470pt; left: 36pt; right: 36pt; bottom: 46pt;
  display: grid; grid-template-columns: 1fr 1fr; gap: 14pt 24pt;
  align-content: start;
}
.block-title {
  font-weight: 500; font-size: 10pt; color: ${STEEL}; margin-bottom: 5pt;
}
.block-body { font-size: 8pt; line-height: 1.55; color: #6f6f6f; }
/* per-model cover: the model's own overview beside its key features */
.model-cover {
  position: absolute; top: 470pt; left: 36pt; right: 36pt; bottom: 46pt;
  display: grid; grid-template-columns: 1fr 1fr; gap: 0 26pt;
}
.mc-heading {
  font-weight: 500; font-size: 10pt; color: ${STEEL}; margin-bottom: 6pt;
}
.mc-overview { font-size: 8pt; line-height: 1.6; color: #6f6f6f; }
.mc-feature {
  display: flex; gap: 5pt; font-size: 7.5pt; line-height: 1.45;
  color: #6f6f6f; margin-bottom: 5pt; break-inside: avoid;
}
.mc-feature .dot { flex: none; }
.mc-feature b { font-weight: 700; color: #4a4a4a; }
.mc-more { font-size: 7pt; color: #a7a9ac; margin-top: 2pt; }
/* page 2 of a per-model sheet: series context, visually secondary */
.why-series { padding-top: 4pt; }
.why-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 14pt 24pt;
  background: #f7f8f8; padding: 14pt 16pt;
}
.cover-note {
  position: absolute; left: 316pt; bottom: 30pt;
  font-size: 7pt; font-weight: 300; color: #a7a9ac;
}

/* ── benefits page ─────────────────────────────────────────────────── */
.benefits-page { position: absolute; top: 21pt; left: 36pt; right: 36pt; }
.benefits-title { padding: 22pt 0 12pt; }
.benefits-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 0 26pt;
  background: #f7f8f8; padding: 14pt 16pt;
}
.benefit {
  display: flex; gap: 6pt; break-inside: avoid;
  font-size: 7.5pt; line-height: 1.5; color: #6f6f6f; margin-bottom: 8pt;
}
.benefit .dot { flex: none; color: #6f6f6f; }
.benefit b { font-weight: 700; color: #4a4a4a; }
.benefits-note { font-size: 7pt; font-weight: 300; color: #a7a9ac; margin-top: 8pt; }
.deploy { margin-top: 16pt; display: flex; justify-content: center; }
.deploy img { max-width: 100%; max-height: 320pt; object-fit: contain; }
.deploy-caption {
  margin-top: 8pt; text-align: center; font-size: 8pt; color: #4a4a4a;
  background: ${ROW_ALT}; padding: 4pt 0;
}

/* ── spec table ────────────────────────────────────────────────────── */
.specs-page { position: absolute; top: 21pt; left: 34pt; right: 37pt; }
.specs-title { padding: 22pt 0 12pt; }
.specs-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.specs-table col.label-col { width: 96pt; }
.specs-table td, .specs-table th {
  border: 0.5pt solid #d9d9d9; padding: 3.5pt 6pt; vertical-align: top; text-align: left;
}
.band-row th {
  background: ${STEEL}; color: white; font-weight: 500; font-size: 8pt;
  text-align: center; border-color: ${STEEL}; padding: 5pt;
}
.model-row td {
  background: ${BAND_DARK}; color: white; font-weight: 500; font-size: 7.5pt; text-align: center;
}
.model-row td:first-child { text-align: left; }
.desc-row td {
  background: ${BAND_LIGHT}; color: white; font-weight: 400; font-size: 7pt; text-align: center;
}
.desc-row td:first-child { text-align: left; }
.spec-row td {
  font-size: 7pt; line-height: 1.4; color: #6f7073; white-space: pre-line;
  /* series columns get narrow — break long unbroken tokens like
     "station(BSU)/subscriber(SU)" instead of letting them bleed out */
  overflow-wrap: anywhere; word-break: break-word;
}
.spec-row td.k { color: #4a4a4a; }
.spec-row:nth-child(even) td { background: ${ROW_ALT}; }

/* ── product views ─────────────────────────────────────────────────── */
.views-page { position: absolute; top: 21pt; left: 36pt; right: 36pt; }
.views-title { padding: 22pt 0 2pt; }
.views-model { font-size: 11pt; color: #4a4a4a; margin-bottom: 14pt; }
.views-grid {
  display: flex; flex-direction: column; align-items: center;
  height: 600pt; justify-content: space-around;
}
.views-grid img { max-width: 470pt; max-height: 265pt; object-fit: contain; }
.views-grid.single { justify-content: center; }
.views-grid.single img { max-height: 420pt; }
.views-ph { width: 430pt; height: 220pt; }

/* ── antenna patterns ──────────────────────────────────────────────── */
.ant-page { position: absolute; top: 21pt; left: 36pt; right: 36pt; }
.ant-title { padding: 22pt 0 2pt; }
.ant-model { font-size: 11pt; color: #4a4a4a; margin-bottom: 16pt; }
.ant-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20pt 24pt; }
.ant-cell { }
.ant-tags { display: flex; flex-direction: column; gap: 2pt; margin-bottom: 4pt; }
.ant-group, .ant-plane {
  align-self: flex-start; background: ${BAND_DARK}; color: white;
  font-size: 7pt; padding: 1.5pt 6pt;
}
.ant-plane { background: ${BAND_LIGHT}; }
.ant-plot {
  border: 0.5pt solid #d9d9d9; display: flex; align-items: center;
  justify-content: center; height: 200pt;
}
.ant-plot img { max-width: 100%; max-height: 190pt; object-fit: contain; }
.ant-ph { width: 100%; height: 100%; border: none; background: transparent; font-size: 7pt; }

/* ── footer ────────────────────────────────────────────────────────── */
.footer {
  position: absolute; bottom: 0; left: 0; right: 0;
  background: #eff0f2; padding: 14pt 36pt 20pt 36pt;
}
.footer-content { display: table; width: 100%; }
.footer-left { display: table-cell; vertical-align: top; padding-right: 30pt; }
.footer-right { display: table-cell; vertical-align: bottom; width: 75pt; text-align: center; }
.footer-logo img { height: 17pt; margin-bottom: 6pt; }
.footer-disclaimer { font-weight: 300; font-size: 5.5pt; color: #6d6e71; line-height: 1.45; }
.footer-version { font-weight: 300; font-size: 5.5pt; color: #6d6e71; margin-top: 4pt; }
.footer-qr { background: white; padding: 2pt 2pt 5pt 2pt; display: inline-block; }
.footer-qr img { width: 41pt; height: 41pt; display: block; }
.footer-qr-label { font-size: 7pt; color: #6b7580; margin-top: 2pt; }
`,
        }}
      />

      {/* ═══ COVER ═══ */}
      <div className="page">
        <div className="cover-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-img" src="/logo/EnGenius-Logo-white.png" alt="EnGenius" />
          <span className="ds-label">
            Datasheet | <strong>{categoryLabel}</strong>
          </span>
        </div>
        <div className="hero">
          <div className="hero-titles">
            <div
              className="hero-title"
              style={{ fontSize: `${coverHeadline.length > 46 ? 17 : 21}pt` }}
            >
              {coverHeadline}
            </div>
            <div className="hero-series">{isSeries ? seriesName : focusModel?.model_name}</div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroImg} alt="" />
        </div>
        {isSeries ? (
          <div className="cover-blocks">
            {blocks.map((b, i) => (
              <div key={i}>
                <div className="block-title">{b.title}</div>
                <div className="block-body">{b.bullets.join(" ")}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="model-cover">
            <div>
              <div className="mc-heading">Overview</div>
              <div className="mc-overview">{modelOverview}</div>
            </div>
            <div>
              <div className="mc-heading">Key Features</div>
              {modelFeatures.slice(0, COVER_FEATURE_LIMIT).map((f, i) => {
                const m = f.match(/^([^:]{2,60}):\s*(.*)$/);
                return (
                  <div key={i} className="mc-feature">
                    <span className="dot">•</span>
                    <span>
                      {m ? (
                        <>
                          <b>{m[1]}:</b> {m[2]}
                        </>
                      ) : (
                        f
                      )}
                    </span>
                  </div>
                );
              })}
              {modelFeatures.length > COVER_FEATURE_LIMIT && (
                <div className="mc-more">
                  {`+ ${modelFeatures.length - COVER_FEATURE_LIMIT} more — see Features & Benefits`}
                </div>
              )}
            </div>
          </div>
        )}
        {footnote && <div className="cover-note">{footnote}</div>}
        <div className="page-number">{nextPage()}</div>
      </div>

      {/* ═══ FEATURES & BENEFITS (series) / rest-of-features + series
             context (per-model) ═══ */}
      <div className="page">
        <div className="top-bar" />
        <div className="benefits-page">
          <div className="benefits-title">
            <span className="section-title">Features &amp; Benefits</span>
          </div>
          <div className="benefits-grid">
            {(isSeries ? benefits : modelFeatures.slice(COVER_FEATURE_LIMIT)).map((b, i) => {
              const m = b.match(/^([^:]{2,60}):\s*(.*)$/);
              return (
                <div key={i} className="benefit">
                  <span className="dot">•</span>
                  <span>
                    {m ? (
                      <>
                        <b>{m[1]}:</b> {m[2]}
                      </>
                    ) : (
                      b
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          {footnote && <div className="benefits-note">{footnote}</div>}

          {/* A per-model sheet carries the series positioning as CONTEXT,
              after its own feature list — not as its identity. */}
          {!isSeries && blocks.length > 0 && (
            <div className="why-series">
              <div className="benefits-title">
                <span className="section-title">Why the {seriesName}</span>
              </div>
              <div className="why-grid">
                {blocks.map((b, i) => (
                  <div key={i}>
                    <div className="block-title">{b.title}</div>
                    <div className="block-body">{b.bullets.join(" ")}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isSeries && (
            <>
              <div className="deploy">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={deployImg} alt="PtP/PtMP deployment applications" />
              </div>
              <div className="deploy-caption">PtP/PtMP Deployment Applications Diagram</div>
            </>
          )}
        </div>
        <div className="page-number">{nextPage()}</div>
      </div>

      {/* ═══ TECHNICAL SPECIFICATIONS ═══ */}
      {specPages.map((rows, pi) => (
        <div key={`spec-${pi}`} className="page">
          <div className="top-bar" />
          <div className="specs-page">
            <div className="specs-title">
              <span className="section-title">Technical Specifications</span>
            </div>
            <table className="specs-table">
              <colgroup>
                <col className="label-col" />
                {columns.map((_, i) => (
                  <col key={i} />
                ))}
              </colgroup>
              <thead>
                <tr className="band-row">
                  <th colSpan={columns.length + 1}>{headline}</th>
                </tr>
              </thead>
              <tbody>
                {pi === 0 && (
                  <>
                    <tr className="model-row">
                      <td>Model Number</td>
                      {columns.map((p) => (
                        <td key={p.id}>{p.model_name}</td>
                      ))}
                    </tr>
                    <tr className="desc-row">
                      <td>Description</td>
                      {columns.map((p) => (
                        <td key={p.id}>{p.headline || p.subtitle}</td>
                      ))}
                    </tr>
                  </>
                )}
                {rows.map((r, ri) => (
                  <tr key={ri} className="spec-row">
                    <td className="k">{r.label}</td>
                    {r.values.map((v, vi) => (
                      <td key={vi}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lastSection === "specs" && pi === specPages.length - 1 && <Footer />}
          <div className="page-number">{nextPage()}</div>
        </div>
      ))}

      {/* ═══ PRODUCT VIEWS ═══ */}
      {productViews.map(({ product: p, shots }, vi) => (
        <div key={`views-${p.id}`} className="page">
          <div className="top-bar" />
          <div className="views-page">
            <div className="views-title">
              <span className="section-title">Product Views</span>
            </div>
            <div className="views-model">{p.model_name}</div>
            <div className={`views-grid${shots.length === 1 ? " single" : ""}`}>
              {shots.length > 0 ? (
                shots.map((url, i) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img key={i} src={url} alt={`${p.model_name} view ${i + 1}`} />
                ))
              ) : (
                <>
                  <Placeholder slot={`${p.model_name}_hardware.png`} className="views-ph" />
                  <Placeholder slot={`${p.model_name}_hardware_2.png`} className="views-ph" />
                </>
              )}
            </div>
          </div>
          {lastSection === "views" && vi === productViews.length - 1 && <Footer />}
          <div className="page-number">{nextPage()}</div>
        </div>
      ))}

      {/* ═══ ANTENNA PATTERNS ═══ */}
      {antennaPages.map(({ product: p, plots }, idx) => {
        const isLast = idx === antennaPages.length - 1;
        return (
          <div key={`ant-${p.id}`} className="page">
            <div className="top-bar" />
            <div className="ant-page">
              <div className="ant-title">
                <span className="section-title">Antenna Patterns</span>
              </div>
              <div className="ant-model">{p.model_name}</div>
              <div className="ant-grid">
                {plots.map((plot) => (
                  <div key={plot.label} className="ant-cell">
                    <div className="ant-tags">
                      <span className="ant-group">{plot.group}</span>
                      <span className="ant-plane">{plot.plane}</span>
                    </div>
                    <div className="ant-plot">
                      {plot.url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={plot.url} alt={plot.label} />
                      ) : (
                        <Placeholder
                          slot={`${p.model_name}_${plot.label.replace(/\s+/g, "_")}.png`}
                          className="ant-ph"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {isLast && <Footer />}
            <div className="page-number">{nextPage()}</div>
          </div>
        );
      })}

      <span style={{ display: "none" }} data-total-pages={totalPages} />
    </>
  );
}
