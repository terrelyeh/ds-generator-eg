import React from "react";
import { PrintToolbar } from "@/components/preview/print-toolbar";
import { getDict } from "@/lib/datasheet/locales";
import type { ProductLine } from "@eg/db/types";
import type { SeriesFeatureGroup, SeriesSpecsData } from "@/lib/google/sheets-extra";
import type { SeriesImages } from "@/lib/google/drive-images";

/**
 * EDGE AI BOX series datasheet — teal layout traced from the DS_Orin Box
 * draft. This line ships ONE datasheet for the whole series
 * (`ds_scope='series'`), so there is no per-model variant.
 *
 * Fixed 5-page structure: cover (hero + product shot + grouped features) /
 * Software Architecture / curated comparison table / Hardware Overview per
 * variant group (base vs "W") + Contact-Us footer.
 *
 * Content comes from the same `line_datasheets` row every scope reads —
 * `loadLineDatasheetContent` fills the copy, `loadSeriesSpecs` the table,
 * `syncSeriesImages` the artwork.
 */

const TEAL = "#86c9cf";

export interface OrinSeriesContent {
  headline: string | null;
  series_name: string | null;
  category_label: string | null;
  overview: string | null;
  features: SeriesFeatureGroup[];
  software_arch: string | null;
  specs: Partial<SeriesSpecsData> | null;
  images: Partial<SeriesImages> | null;
  current_version: string | null;
}

/** Dashed placeholder shown in preview when an image slot is empty. */
function Placeholder({ slot, className }: { slot: string; className?: string }) {
  return (
    <div className={`img-placeholder ${className ?? ""}`}>
      missing: {slot}
    </div>
  );
}

export function EdgeAiSeriesPreview({
  line,
  content: ld,
  productImages,
  showToolbar,
  userRole,
  versionOverride,
}: {
  line: ProductLine;
  content: OrinSeriesContent;
  /** model_name → product_image, for the spec table's column thumbnails */
  productImages: Map<string, string | null>;
  showToolbar: boolean;
  userRole: import("@eg/auth/permissions").Role | null;
  versionOverride: string | null;
}) {
  const dict = getDict("en");
  const pl = line;
  const headline = ld.headline ?? "";
  const seriesName = ld.series_name ?? pl.label;
  const categoryLabel = ld.category_label ?? pl.category;
  const overview = ld.overview ?? "";
  const features = Array.isArray(ld.features) ? ld.features : [];
  const softwareArch = ld.software_arch ?? "";
  const specColumns = ld.specs?.columns ?? [];
  const specRows = ld.specs?.rows ?? [];
  const images: SeriesImages = {
    hero: ld.images?.hero ?? null,
    cover_product: ld.images?.cover_product ?? null,
    architecture: ld.images?.architecture ?? null,
    hw_pages: ld.images?.hw_pages ?? [],
  };

  /** Base model of a paired column ("E5-NA08 / E5-NA08W" → "E5-NA08"). */
  const columnThumb = (number: string): string | null => {
    const base = number.split("/")[0]?.trim();
    return (base && productImages.get(base)) || null;
  };

  // QR: same treatment as Transceivers — no QSG for a series, so the code
  // points at Contact Us unless the line carries an explicit template.
  // (qr_url_template is cast locally — same idiom as the per-model preview,
  // the hand-written ProductLine type lags the real schema.)
  const plExt = pl as typeof pl & { qr_url_template: string | null };
  const qrUrl = (
    plExt.qr_url_template || "https://www.engeniustech.com/contact-us"
  ).replace("{model}", pl.name.toLowerCase().replace(/\s+/g, "-"));
  const qrLabel = "Contact Us";
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrUrl)}`;

  const currentVersion = ld.current_version ?? "0.0";
  const version = versionOverride || ld.current_version || "1.0";
  const today = new Date().toLocaleDateString(dict.dateLocale, {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });

  // Official PDF requires the full content + every image slot filled
  // (2 renders per hardware page, like the draft). Preview renders dashed
  // placeholders for anything missing so MKT can see what to chase.
  const canGenerate =
    !!overview &&
    features.length > 0 &&
    specRows.length > 0 &&
    !!images.hero &&
    !!images.cover_product &&
    !!images.architecture &&
    images.hw_pages.length > 0 &&
    images.hw_pages.every((p) => p.images.length >= 2);

  const hwPages = images.hw_pages;
  const totalPages = 3 + hwPages.length;

  return (
    <>
      {showToolbar && (
        <PrintToolbar
          model={pl.name}
          currentVersion={currentVersion}
          canGenerate={canGenerate}
          locale="en"
          userRole={userRole}
          translationConfirmed
          series
        />
      )}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;600;700&display=swap');

@page { size: letter; margin: 0; }

* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  color-adjust: exact !important;
}

body {
  font-family: 'Roboto', sans-serif;
  color: #6f6f6f;
  font-size: 7pt;
  line-height: 1.4;
  background: #e0e0e0;
  padding-top: ${showToolbar ? "48px" : "0"};
}

@media print {
  html, body {
    padding: 0 !important;
    margin: 0 !important;
    background: white !important;
    min-height: 0 !important;
  }
  .page {
    box-shadow: none !important;
    margin: 0 !important;
    page-break-after: always;
    page-break-inside: avoid;
  }
  .page:last-of-type { page-break-after: auto; }
  .print-toolbar { display: none !important; }
}

.page {
  width: 612pt;
  height: 792pt;
  position: relative;
  overflow: hidden;
  page-break-after: always;
  background: white;
  margin: 20px auto;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

/* Top bars (per-model preview conventions, teal theme) */
.top-bar { background: ${TEAL}; height: 21.4pt; width: 100%; }
.top-bar-full { background: ${TEAL}; height: 94.5pt; width: 100%; position: relative; }
.top-bar-full .logo-img {
  position: absolute; left: 36pt; top: 50%; transform: translateY(-50%); height: 27pt;
}
.top-bar-full .title-area { position: absolute; right: 27pt; top: 44pt; }
.top-bar-full .title-prefix { font-weight: 300; font-size: 12pt; color: white; }
.top-bar-full .title-category { font-weight: 500; font-size: 14pt; color: white; }

.page-number {
  position: absolute; right: 23pt; bottom: 18pt;
  font-weight: 300; font-size: 7pt; color: #6f7073;
}

.section-title {
  font-weight: 500; font-size: 17pt; color: ${TEAL}; margin-bottom: 10pt;
}

/* Image placeholder (preview only — canGenerate blocks official PDFs
   while any slot is missing) */
.img-placeholder {
  border: 1pt dashed #b9bfc4; background: #f8f9fa; color: #9aa3ab;
  display: flex; align-items: center; justify-content: center;
  font-size: 8pt; font-weight: 400;
}

/* ── Page 1: cover ─────────────────────────────────────────────────── */
.hero {
  position: absolute; top: 94.5pt; left: 0; right: 0; height: 305pt;
  overflow: hidden; background: #3a3f42;
}
.hero-bg {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: cover; object-position: center;
}
/* hero placeholder keeps the dark backdrop so the white overlay title
   stays readable while the photo is missing */
.hero-ph {
  position: absolute; inset: 0;
  background: transparent; border: none; color: rgba(255,255,255,0.55);
  align-items: flex-end; padding: 8pt; justify-content: flex-start;
}
/* subtle darkening so the white title stays readable on bright photos */
.hero-scrim {
  position: absolute; inset: 0;
  background: linear-gradient(90deg, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.12) 55%, rgba(0,0,0,0) 100%);
}
/* metrics traced from the DS_Orin Box draft: title x=34pt (we keep the
   36pt page margin), second line runs to x=400pt → give it 396pt so
   "Powered by NVIDIA® Jetson Orin™" stays on ONE line at 24pt */
.hero-title {
  position: absolute; left: 36pt; top: 76pt; width: 410pt; z-index: 2;
  font-weight: 500; font-size: 24pt; line-height: 1.18; color: white;
  white-space: pre-line;
}
.hero-series {
  position: absolute; left: 36pt; top: 161pt; z-index: 2;
  font-weight: 400; font-size: 17.5pt; color: white;
}
.hero-product {
  position: absolute; right: 24pt; top: 130pt; z-index: 1;
  max-width: 240pt; max-height: 150pt; object-fit: contain;
}
.hero-product-ph {
  position: absolute; right: 24pt; top: 130pt; width: 240pt; height: 150pt;
}

.cover-overview {
  position: absolute; left: 36pt; top: 448pt; width: 262pt;
}
.overview-text {
  font-weight: 400; font-size: 10pt; color: #6f6f6f; line-height: 1.55;
  white-space: pre-line;
}
.cover-features {
  position: absolute; left: 322pt; right: 36pt; top: 448pt;
}
.features-box {
  background: #f1f1f1; padding: 12pt 14pt; margin-top: 2pt;
}
.feature-group { margin-bottom: 9pt; }
.feature-group:last-child { margin-bottom: 0; }
.feature-group-title {
  font-weight: 700; font-size: 8pt; color: #6f6f6f; margin-bottom: 2pt;
}
.feature-bullet {
  display: flex; gap: 5pt;
  font-weight: 400; font-size: 8pt; color: #6f6f6f; line-height: 1.4;
  margin-left: 6pt;
}
.feature-bullet .dot { flex: none; }

/* ── Page 2: software architecture ─────────────────────────────────── */
.arch-page { position: absolute; left: 36pt; right: 36pt; top: 56pt; bottom: 40pt; }
.arch-text {
  font-weight: 400; font-size: 10pt; color: #6f6f6f; line-height: 1.55;
  white-space: pre-line; margin-bottom: 20pt;
}
.arch-image-container {
  display: flex; align-items: flex-start; justify-content: center;
}
.arch-image-container img { max-width: 430pt; max-height: 430pt; object-fit: contain; }
.arch-ph { width: 430pt; height: 300pt; margin: 0 auto; }

/* ── Page 3: technical specifications (series comparison) ──────────── */
.specs-page { position: absolute; left: 36pt; right: 36pt; top: 56pt; bottom: 40pt; }
.specs-table {
  width: 100%; border-collapse: collapse; table-layout: fixed;
  margin-top: 6pt;
}
.specs-table col.label-col { width: 118pt; }
.specs-table td, .specs-table th {
  border: 0.5pt solid #d9d9d9; text-align: center; vertical-align: middle;
  padding: 3pt 5pt;
}
.specs-band th {
  background: ${TEAL}; color: white; font-weight: 400; font-size: 8pt;
  padding: 4.5pt 5pt; border-color: ${TEAL};
}
.specs-photo-row td { border-bottom: none; padding: 6pt 4pt 2pt; height: 64pt; }
.specs-photo-row img { max-height: 56pt; max-width: 100%; object-fit: contain; }
.specs-photo-ph { height: 52pt; margin: 0 auto; width: 80%; }
.model-name-row td {
  background: #6e6e6e; color: white; font-weight: 400; font-size: 7pt;
}
.model-number-row td {
  background: #969696; color: white; font-weight: 400; font-size: 7pt;
}
.spec-row td { font-weight: 400; font-size: 7pt; color: #6f6f6f; line-height: 1.35; }
.spec-row td.spec-label { color: #231f20; }
.spec-row:nth-child(even) td { background: #f7f7f7; }

/* ── Hardware overview pages ───────────────────────────────────────── */
.hw-page { position: absolute; left: 36pt; right: 36pt; top: 56pt; }
.hw-subtitle {
  font-weight: 400; font-size: 11pt; color: #231f20; margin-bottom: 8pt;
}
.hw-images {
  display: flex; flex-direction: column; align-items: center; gap: 22pt;
  margin-top: 8pt;
}
.hw-images img { max-width: 470pt; max-height: 262pt; object-fit: contain; }
.hw-ph { width: 420pt; height: 220pt; }
/* last hardware page shares space with the footer */
.hw-images.with-footer img { max-height: 225pt; }

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
        <div className="top-bar-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-img" src="/logo/EnGenius-Logo-white.png" alt="EnGenius" />
          <div className="title-area">
            <span className="title-prefix">Datasheet | </span>
            <span className="title-category">{categoryLabel}</span>
          </div>
        </div>

        <div className="hero">
          {images.hero ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="hero-bg" src={images.hero} alt="" />
              <div className="hero-scrim" />
            </>
          ) : (
            <Placeholder slot="series_hero.png" className="hero-ph" />
          )}
          <div className="hero-title">{headline}</div>
          <div className="hero-series">{seriesName}</div>
          {images.cover_product ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img className="hero-product" src={images.cover_product} alt={seriesName} />
          ) : (
            <Placeholder slot="series_cover_product.png" className="hero-product-ph" />
          )}
        </div>

        <div className="cover-overview">
          <div className="section-title">Overview</div>
          <div className="overview-text">{overview}</div>
        </div>

        <div className="cover-features">
          <div className="section-title">Key Features &amp; Benefits</div>
          <div className="features-box">
            {features.map((g, gi) => (
              <div key={gi} className="feature-group">
                {g.title && <div className="feature-group-title">{g.title}:</div>}
                {g.bullets.map((b, bi) => (
                  <div key={bi} className="feature-bullet">
                    <span className="dot">•</span>
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="page-number">1</div>
      </div>

      {/* ═══ PAGE 2 — SOFTWARE ARCHITECTURE ═══ */}
      <div className="page">
        <div className="top-bar" />
        <div className="arch-page">
          <div className="section-title">Software Architecture</div>
          <div className="arch-text">{softwareArch}</div>
          <div className="arch-image-container">
            {images.architecture ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={images.architecture} alt="Software Architecture" />
            ) : (
              <Placeholder slot="series_architecture.png" className="arch-ph" />
            )}
          </div>
        </div>
        <div className="page-number">2</div>
      </div>

      {/* ═══ PAGE 3 — TECHNICAL SPECIFICATIONS ═══ */}
      <div className="page">
        <div className="top-bar" />
        <div className="specs-page">
          <div className="section-title">Technical Specifications</div>
          <table className="specs-table">
            <colgroup>
              <col className="label-col" />
              {specColumns.map((_, i) => (
                <col key={i} />
              ))}
            </colgroup>
            <thead>
              <tr className="specs-band">
                <th colSpan={specColumns.length + 1}>{categoryLabel}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="specs-photo-row">
                <td />
                {specColumns.map((c, i) => {
                  const thumb = columnThumb(c.number);
                  return (
                    <td key={i}>
                      {thumb ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={thumb} alt={c.name} />
                      ) : (
                        <div className="img-placeholder specs-photo-ph">
                          {c.number.split("/")[0]?.trim()}_product
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
              <tr className="model-name-row">
                <td>Model Name</td>
                {specColumns.map((c, i) => (
                  <td key={i}>{c.name}</td>
                ))}
              </tr>
              <tr className="model-number-row">
                <td>Model Number</td>
                {specColumns.map((c, i) => (
                  <td key={i}>{c.number}</td>
                ))}
              </tr>
              {specRows.map((row, ri) => (
                <tr key={ri} className="spec-row">
                  <td className="spec-label">{row.label}</td>
                  {row.values.map((v, vi) => (
                    <td key={vi}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="page-number">3</div>
      </div>

      {/* ═══ HARDWARE OVERVIEW PAGES (one per variant group) ═══ */}
      {hwPages.map((hw, pi) => {
        const isLast = pi === hwPages.length - 1;
        return (
          <div key={pi} className="page">
            <div className="top-bar" />
            <div className="hw-page">
              <div className="section-title">{dict.hardwareOverview}</div>
              <div className="hw-subtitle">{hw.subtitle}</div>
              <div className={`hw-images${isLast ? " with-footer" : ""}`}>
                {hw.images.length > 0 ? (
                  hw.images.map((url, ii) => (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img key={ii} src={url} alt={`${hw.subtitle} hardware ${ii + 1}`} />
                  ))
                ) : (
                  <>
                    <Placeholder slot={`series_hw${pi + 1}_a.png`} className="hw-ph" />
                    <Placeholder slot={`series_hw${pi + 1}_b.png`} className="hw-ph" />
                  </>
                )}
                {hw.images.length === 1 && (
                  <Placeholder slot={`series_hw${pi + 1}_b.png`} className="hw-ph" />
                )}
              </div>
            </div>

            {isLast && (
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
                    <div className="footer-qr-label">{qrLabel}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="page-number">{4 + pi}</div>
          </div>
        );
      })}

      {/* keep totalPages referenced for future overflow checks */}
      <span style={{ display: "none" }} data-total-pages={totalPages} />
    </>
  );
}
