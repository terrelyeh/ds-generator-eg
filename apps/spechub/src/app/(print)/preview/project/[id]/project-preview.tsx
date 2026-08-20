import React from "react";
import { ProjectPrintToolbar } from "@/components/preview/project-print-toolbar";
import { displayFontStack, MANROPE_IMPORT_URL } from "@/lib/datasheet/typography";
import { bulletDotCss } from "@/lib/datasheet/bullet";
import { PT, WT } from "@/lib/datasheet/scale";
import { getDict } from "@/lib/datasheet/locales";
import { CONTACT_US_URL } from "@/lib/datasheet/qr";
import { resolveMatrix } from "@/lib/project-datasheet/resolve";
import { getProjectTheme } from "@/lib/project-datasheet/themes";
import { DEFAULT_SECTIONS } from "@/lib/project-datasheet/types";
import type {
  DocRules,
  FeatureBlock,
  ModelImage,
  ResolvedRow,
  SectionToggles,
  BlankMode,
} from "@/lib/project-datasheet/types";
import type { ProjectDatasheet, ProjectDatasheetModel } from "@eg/db/types";

/**
 * PROJECT / TENDER datasheet renderer — the "series matrix" layout.
 *
 * A separate component from the catalogue layouts on purpose. Parameterising
 * `broadband-preview.tsx` would have been less code, but it would also mean
 * every tweak made for a one-off tender could regress the EOC series sheet
 * that ships to customers today. The isolation argument that keeps this data
 * out of `products` applies just as much to the renderer.
 *
 * What IS shared is the layout vocabulary — `scale.ts` for type steps,
 * `bullet.ts` for list dots, `typography.ts` for the display face — so a
 * tender sheet still reads as an EnGenius document rather than a lookalike.
 *
 * Three things this layout has that no catalogue layout does, all of them
 * consequences of printing a product that doesn't exist yet:
 *
 *   1. a PRELIMINARY notice that cannot be switched off, only reworded
 *   2. section toggles — Package Contents has no content at quoting time,
 *      and an empty section reads as an oversight rather than a stage
 *   3. TBD / — placeholders, because "the ODM hasn't answered" is the
 *      normal state of a spec table at this point, not an error
 */

const INK = "#231f20";
const MUTED = "#6f7073";

/**
 * The spec table's type step, and the pagination maths derived from it.
 *
 * A step above the catalogue layouts on purpose. `scale.ts` fixes the ladder
 * but lets each layout choose its rung, and a tender sheet is read on a
 * meeting table in print far more often than a product datasheet is —
 * `tableSm` survives a screen and loses an argument on paper.
 *
 * Derived rather than written twice: the previous version hard-coded 7pt in
 * the char-width estimate and 9.6pt of leading in the row height, so changing
 * the font size would have silently left pagination measuring the old one and
 * packed rows past the bottom margin.
 */
const SPEC_PT = PT.table;
const SPEC_LINE = SPEC_PT * 1.4;
/** Roughly the average glyph width as a fraction of the em, at this size. */
const SPEC_CHAR_W = SPEC_PT * 0.5;

/** ~chars per line in a value column of `width` pt at the spec size. */
function estRows(text: string, width: number): number {
  const perLine = Math.max(8, Math.floor(width / SPEC_CHAR_W));
  return text
    .split("\n")
    .reduce((n, seg) => n + Math.max(1, Math.ceil(seg.trim().length / perLine)), 0);
}

/**
 * Break rows into pages by estimated height. Same approach the Broadband
 * layout uses: over-estimate, because a page that breaks one row early is
 * invisible and a page that breaks one row late runs off the bottom.
 */
function paginate(
  rows: ResolvedRow[],
  valueWidth: number,
  first: number,
  rest: number,
): ResolvedRow[][] {
  const pages: ResolvedRow[][] = [];
  let cur: ResolvedRow[] = [];
  let used = 0;
  let budget = first;
  for (const r of rows) {
    const lines = Math.max(
      estRows(r.label, 110),
      ...r.cells.map((c) => estRows(c.value, valueWidth)),
    );
    const h = lines * SPEC_LINE + 8;
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

function Placeholder({ slot, className }: { slot: string; className?: string }) {
  return <div className={`img-ph ${className ?? ""}`}>missing: {slot}</div>;
}

function asFeatureBlocks(value: unknown): FeatureBlock[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((b) => {
    if (!b || typeof b !== "object") return [];
    const block = b as Partial<FeatureBlock>;
    if (typeof block.title !== "string") return [];
    return [{ title: block.title, bullets: Array.isArray(block.bullets) ? block.bullets : [] }];
  });
}

function asImages(value: unknown): ModelImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((i) => {
    if (!i || typeof i !== "object") return [];
    const img = i as Partial<ModelImage>;
    if (typeof img.url !== "string" || !img.url) return [];
    return [{ slot: img.slot || "product", url: img.url, caption: img.caption ?? null }];
  });
}

function asSections(value: unknown): SectionToggles {
  if (!value || typeof value !== "object") return DEFAULT_SECTIONS;
  return { ...DEFAULT_SECTIONS, ...(value as Partial<SectionToggles>) };
}

export function ProjectPreview({
  doc,
  models,
  showToolbar,
}: {
  doc: ProjectDatasheet;
  models: ProjectDatasheetModel[];
  showToolbar: boolean;
}) {
  const theme = getProjectTheme(doc.layout);
  // The footer carries the same neutral boilerplate every EnGenius datasheet
  // carries. The PRELIMINARY notice lives on the cover, where it is the point;
  // repeating it down here made the footer read like a different document's.
  const dict = getDict("en");
  const sections = asSections(doc.sections);
  const displayFont = displayFontStack("en");
  const docImages = asImages(doc.images);

  const allRows = resolveMatrix({
    models,
    docRules: (doc.doc_rules ?? {}) as DocRules,
    blankPolicy: (doc.blank_policy as BlankMode) ?? "tbd",
  });

  const specRows = allRows.filter((r) => r.group === "spec");
  const softwareRows = allRows.filter((r) => r.group === "software");
  const packageRows = allRows.filter((r) => r.group === "package");

  const valueWidth = Math.max(70, 430 / Math.max(1, models.length));
  const specPages = paginate(specRows, valueWidth, 540, 620);

  /**
   * A model with nothing in this group is dropped from ITS table only. When
   * only one of two units has a documented software feature set, a column of
   * TBDs beside it tells the reader nothing and looks like the product is
   * worse rather than undocumented.
   */
  const softwareCols = models
    .map((_, i) => i)
    .filter((i) => softwareRows.some((r) => !r.cells[i].isBlank));
  const packageCols = models
    .map((_, i) => i)
    .filter((i) => packageRows.some((r) => !r.cells[i].isBlank));

  const featureBlocks = asFeatureBlocks(doc.features);
  const coverShots = models.map((m) => ({
    model: m,
    img: asImages(m.images).find((i) => i.slot === "product") ?? asImages(m.images)[0] ?? null,
  }));
  const hardwareShots = models.map((m) => ({
    model: m,
    shots: asImages(m.images).filter((i) => i.slot !== "product"),
  }));
  const hasAnyImage = coverShots.some((c) => c.img) || hardwareShots.some((h) => h.shots.length);
  const diagram = docImages.find((i) => i.slot === "diagram") ?? null;

  let pageNo = 0;
  const nextPage = () => ++pageNo;

  // The footer QR always points at Contact Us. A project datasheet has no
  // Quick Start Guide to link to — the product doesn't exist yet — and the
  // whole point of the document is to start a conversation.
  const qrCodeUrl =
    "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=" +
    encodeURIComponent(CONTACT_US_URL);
  const today = new Date().toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });

  const showSoftware = sections.software && softwareRows.length > 0 && softwareCols.length > 0;
  const showPackage = sections.package && packageRows.length > 0 && packageCols.length > 0;
  const showHardware = sections.hardware && hardwareShots.some((h) => h.shots.length > 0);
  const showDiagram = sections.diagram && !!diagram;
  /**
   * The deployment diagram rides under Features & Benefits when that page
   * exists. A page containing one picture reads as a gap in the document,
   * and the diagram is doing the same job as the benefits — showing what the
   * product is FOR — so it belongs in the same breath. It only gets a page of
   * its own when there is no benefits page to sit under.
   */
  const diagramWithFeatures = showDiagram && sections.features && featureBlocks.length > 0;

  // The footer rides the LAST page whichever section that turns out to be,
  // so toggling a section off can never orphan the disclaimer.
  const lastSection: string = showDiagram && !diagramWithFeatures
    ? "diagram"
    : showPackage
      ? "package"
      : showHardware
        ? "hardware"
        : showSoftware
          ? "software"
          : sections.specs
            ? "specs"
            : "cover";

  const Footer = () => (
    <div className="footer">
      <div className="footer-content">
        <div className="footer-left">
          <div className="footer-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo/EnGenius-Logo-gray.png" alt="EnGenius" />
          </div>
          <div className="footer-disclaimer">{dict.disclaimer}</div>
          {/* No customer name: one sourced product is approached to several
              projects, and a sheet reaching the wrong reader with another
              buyer's name on it says who else we are quoting. */}
          <div className="footer-version">{today}</div>
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

  const MatrixTable = ({
    rows,
    cols,
    heading,
  }: {
    rows: ResolvedRow[];
    cols: number[];
    heading: string;
  }) => (
    <table className="specs-table">
      <colgroup>
        <col className="label-col" />
        {cols.map((i) => (
          <col key={i} />
        ))}
      </colgroup>
      <thead>
        <tr className="band-row">
          <th colSpan={cols.length + 1}>{heading}</th>
        </tr>
      </thead>
      <tbody>
        <tr className="model-row">
          <td>Model</td>
          {cols.map((i) => (
            <td key={i}>{models[i].model_name}</td>
          ))}
        </tr>
        {rows.map((r) => (
          <tr key={r.key} className="spec-row">
            <td className="k">{r.label}</td>
            {cols.map((i) => (
              <td key={i} className={r.cells[i].isBlank ? "blank" : undefined}>
                {r.cells[i].value}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <>
      {showToolbar && <ProjectPrintToolbar id={doc.id} name={doc.name} />}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap');
@import url('${MANROPE_IMPORT_URL}');
@page { size: letter; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
body {
  font-family: Roboto, system-ui, sans-serif; color: ${MUTED};
  font-size: ${PT.table}pt; line-height: 1.4; background: #e0e0e0;
  padding-top: ${showToolbar ? "48px" : "0"};
}
@media print {
  html, body { padding: 0 !important; margin: 0 !important; background: white !important; }
  .page { box-shadow: none !important; margin: 0 !important; page-break-after: always; page-break-inside: avoid; }
  .page:last-of-type { page-break-after: auto; }
}
.page {
  width: 612pt; height: 792pt; position: relative; overflow: hidden;
  page-break-after: always; background: white; margin: 20px auto;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
.top-bar { background: ${theme.primary}; height: 21pt; width: 100%; }
.page-number {
  position: absolute; right: 27pt; bottom: 18pt;
  font-weight: ${WT.light}; font-size: ${PT.tableSm}pt; color: ${MUTED};
}
.hero-title, .hero-series, .block-title, .section-title, .cover-header .ds-label {
  font-family: ${displayFont};
}
.section-title {
  font-weight: ${WT.semi}; font-size: ${PT.head}pt; color: ${theme.primary};
}
.img-ph {
  border: 1pt dashed #b9bfc4; background: #f8f9fa; color: #9aa3ab;
  display: flex; align-items: center; justify-content: center;
  font-size: ${PT.table}pt; min-height: 90pt;
}

/* ── cover ─────────────────────────────────────────────────────────── */
.cover-header {
  position: absolute; top: 0; left: 0; right: 0; height: 96pt;
  background: ${theme.headerBg}; padding: 0 44pt;
  display: flex; align-items: center; justify-content: space-between;
}
.cover-header img { height: 22pt; }
.cover-header .ds-label {
  color: #fff; font-size: ${PT.label}pt; font-weight: ${WT.medium};
  letter-spacing: .04em; text-transform: uppercase;
}
/* Fixed box from under the header band to just above the PRELIMINARY strip,
   so the product shots can take whatever the copy doesn't. A fixed image
   height instead would be a guess that is wrong twice: too small for the
   tall, narrow outdoor units (where the height cap binds long before the
   width does, leaving a third of the cover empty) and too large the moment
   someone writes a four-paragraph overview. */
.cover-body {
  position: absolute; top: 96pt; left: 44pt; right: 44pt; bottom: 104pt;
  display: flex; flex-direction: column; padding-top: 28pt;
}
.hero-title {
  font-size: ${PT.cover}pt; font-weight: ${WT.bold}; color: ${INK};
  line-height: 1.18; margin-bottom: 4pt;
}
.hero-series {
  font-size: ${PT.lead}pt; font-weight: ${WT.medium}; color: ${theme.primary};
  margin-bottom: 16pt;
}
.cover-overview {
  font-size: ${PT.bodyMd}pt; line-height: 1.6; color: ${MUTED};
  white-space: pre-line; max-width: 470pt;
}
.cover-shots {
  display: flex; gap: 24pt; justify-content: center; align-items: stretch;
  margin-top: 22pt; flex: 1; min-height: 0;
}
.cover-shot {
  flex: 1; max-width: 250pt; min-height: 0;
  display: flex; flex-direction: column; justify-content: flex-end; text-align: center;
}
.cover-shot img { flex: 1; min-height: 0; width: 100%; object-fit: contain; }
.cover-shot .cs-name {
  font-family: ${displayFont}; font-size: ${PT.bodyMd}pt; font-weight: ${WT.semi};
  color: ${INK}; margin-top: 8pt;
}
.cover-shot .cs-desc { font-size: ${PT.table}pt; color: ${MUTED}; margin-top: 2pt; }

/* PRELIMINARY strip. On the cover, not only the footer — this document's
   whole risk is that it looks exactly like a real datasheet, and the cover
   is the page that gets screenshotted into an email. */
.prelim {
  position: absolute; left: 44pt; right: 44pt; bottom: 44pt;
  border-left: 3pt solid ${theme.primary}; background: ${theme.featuresBox};
  padding: 8pt 12pt; font-size: ${PT.table}pt; line-height: 1.5; color: ${INK};
}

/* ── features & benefits ───────────────────────────────────────────── */
.body-page {
  padding: 30pt 44pt 0; height: calc(792pt - 21pt);
  display: flex; flex-direction: column;
}
.page-title { margin-bottom: 18pt; }
.blocks { display: grid; grid-template-columns: 1fr 1fr; gap: 14pt 24pt; }
/* Give the diagram the rest of the page rather than a fixed height — the
   benefits list is written per deal and its length is not predictable. */
.blocks.with-diagram { flex: none; }
.deploy {
  flex: 1; min-height: 0; margin-top: 18pt; padding-bottom: 46pt;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.deploy img { max-width: 100%; flex: 1; min-height: 0; object-fit: contain; }
.block {
  background: ${theme.featuresBox}; border-radius: 3pt; padding: 12pt 14pt;
}
.block-title {
  font-size: ${PT.body}pt; font-weight: ${WT.semi}; color: ${theme.primary};
  margin-bottom: 5pt;
}
.block-body { font-size: ${PT.bodyMd}pt; line-height: 1.55; color: ${MUTED}; }
.block-body li {
  list-style: none; display: flex; gap: 6pt; align-items: baseline; margin-bottom: 3pt;
}
${bulletDotCss(".block-body .dot", theme.primary)}

/* ── spec matrix ───────────────────────────────────────────────────── */
.specs-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.specs-table col.label-col { width: 120pt; }
.band-row th {
  background: ${theme.bandDark}; color: #fff; text-align: left;
  font-family: ${displayFont}; font-weight: ${WT.semi};
  font-size: ${PT.bodySm}pt; padding: 5pt 8pt; letter-spacing: .02em;
}
.model-row td {
  background: ${theme.bandLight}; color: #fff; font-weight: ${WT.semi};
  font-size: ${PT.bodySm}pt; padding: 4pt 8pt; border-right: 1pt solid #fff;
}
.spec-row td {
  font-size: ${SPEC_PT}pt; line-height: 1.4; padding: 4pt 8pt;
  vertical-align: top; white-space: pre-line; border-bottom: .5pt solid #dcdedf;
  /* Cellular band lists are slash-separated with no spaces
     ("n1/2/3/5/7/8/12/…"), so a fixed-layout table has nowhere to wrap them
     and they run straight off the page and over the next column. Catalogue
     datasheets never hit this because Wi-Fi specs are ordinary prose;
     cellular ones do it in every second row. */
  overflow-wrap: anywhere;
}
.spec-row td.k { color: ${INK}; font-weight: ${WT.medium}; }
.spec-row:nth-child(even) td { background: ${theme.rowAlt}; }
/* Placeholders are deliberately quiet. A grid of bold TBDs reads as an
   unfinished document; a grid of grey ones reads as a document in progress,
   which is what it is. */
.spec-row td.blank { color: #a2a8ad; font-style: italic; }

/* ── hardware ──────────────────────────────────────────────────────── */
.views-grid {
  display: flex; gap: 20pt; justify-content: center; align-items: center;
  flex-wrap: wrap; margin-bottom: 10pt;
}
.views-grid img { max-width: 210pt; max-height: 250pt; object-fit: contain; }
.views-model {
  font-family: ${displayFont}; font-size: ${PT.bodyMd}pt; font-weight: ${WT.semi};
  color: ${INK}; margin: 14pt 0 6pt;
}
.image-note {
  font-size: ${PT.table}pt; font-style: italic; color: ${MUTED}; margin-top: 10pt;
}
.diagram img { max-width: 100%; max-height: 420pt; object-fit: contain; }
.diagram { text-align: center; }

/* ── footer ─────────────────────────────────────────────────────────
   The catalogue footer, unchanged: grey band, logo + disclaimer on the
   left, Contact Us QR on the right. A tender sheet that ends differently
   from every other EnGenius datasheet reads as a different company's
   document, which is the opposite of what it is for. */
.footer {
  position: absolute; bottom: 0; left: 0; right: 0;
  background: #eff0f2; padding: 14pt 36pt 20pt 36pt;
}
.footer-content { display: table; width: 100%; }
.footer-left { display: table-cell; vertical-align: top; padding-right: 30pt; }
.footer-right { display: table-cell; vertical-align: bottom; width: 75pt; text-align: center; }
.footer-logo img { height: 17pt; margin-bottom: 6pt; }
.footer-disclaimer {
  font-weight: ${WT.light}; font-size: ${PT.footer}pt; color: #6d6e71; line-height: 1.45;
}
.footer-version {
  font-weight: ${WT.light}; font-size: ${PT.footer}pt; color: #6d6e71; margin-top: 4pt;
}
.footer-qr { background: white; padding: 2pt 2pt 5pt 2pt; display: inline-block; }
.footer-qr img { width: 41pt; height: 41pt; display: block; }
.footer-qr-label { font-size: ${PT.tableSm}pt; color: #6b7580; margin-top: 2pt; }
`,
        }}
      />

      {/* ═══ COVER ═══ */}
      <div className="page">
        <div className="cover-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/EnGenius-Logo-white.png" alt="EnGenius" />
          {doc.category_label && <span className="ds-label">{doc.category_label}</span>}
        </div>
        <div className="cover-body">
          <div className="hero-title">{doc.headline || doc.name}</div>
          {doc.series_name && <div className="hero-series">{doc.series_name}</div>}
          {doc.overview && <div className="cover-overview">{doc.overview}</div>}
          <div className="cover-shots">
            {coverShots.map(({ model, img }) => (
              <div className="cover-shot" key={model.id}>
                {img ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={img.url} alt={model.model_name} />
                ) : (
                  <Placeholder slot={`${model.model_name} product shot`} />
                )}
                <div className="cs-name">{model.model_name}</div>
                {model.display_name && <div className="cs-desc">{model.display_name}</div>}
              </div>
            ))}
          </div>
        </div>
        {/* Clears the footer band on the rare single-page document where
            the cover is also the last page. */}
        <div className="prelim" style={lastSection === "cover" ? { bottom: "104pt" } : undefined}>
          {doc.disclaimer}
        </div>
        {lastSection === "cover" && <Footer />}
        <div className="page-number">{nextPage()}</div>
      </div>

      {/* ═══ FEATURES & BENEFITS ═══ */}
      {sections.features && featureBlocks.length > 0 && (
        <div className="page">
          <div className="top-bar" />
          <div className="body-page">
            <div className="page-title">
              <span className="section-title">Features &amp; Benefits</span>
            </div>
            <div className={`blocks${diagramWithFeatures ? " with-diagram" : ""}`}>
              {featureBlocks.map((b, i) => (
                <div className="block" key={i}>
                  <div className="block-title">{b.title}</div>
                  <ul className="block-body">
                    {b.bullets.map((t, j) => (
                      <li key={j}>
                        <span className="dot" />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {/* No image note under the diagram: that note says the product
                PHOTO is a stand-in, and a schematic is not a photo of
                anything. It belongs under the hardware renders, where it is. */}
            {diagramWithFeatures && diagram && (
              <div className="deploy">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={diagram.url} alt="Application diagram" />
              </div>
            )}
          </div>
          <div className="page-number">{nextPage()}</div>
        </div>
      )}

      {/* ═══ TECHNICAL SPECIFICATIONS ═══ */}
      {sections.specs &&
        specPages.map((rows, pi) => (
          <div className="page" key={`spec-${pi}`}>
            <div className="top-bar" />
            <div className="body-page">
              <div className="page-title">
                <span className="section-title">Technical Specifications</span>
              </div>
              <MatrixTable
                rows={rows}
                cols={models.map((_, i) => i)}
                heading={doc.series_name || doc.name}
              />
            </div>
            {lastSection === "specs" && pi === specPages.length - 1 && <Footer />}
            <div className="page-number">{nextPage()}</div>
          </div>
        ))}

      {/* ═══ SOFTWARE FEATURES ═══ */}
      {showSoftware && (
        <div className="page">
          <div className="top-bar" />
          <div className="body-page">
            <div className="page-title">
              <span className="section-title">Software Features</span>
            </div>
            <MatrixTable rows={softwareRows} cols={softwareCols} heading="Software Features" />
          </div>
          {lastSection === "software" && <Footer />}
          <div className="page-number">{nextPage()}</div>
        </div>
      )}

      {/* ═══ HARDWARE OVERVIEW ═══ */}
      {showHardware && (
        <div className="page">
          <div className="top-bar" />
          <div className="body-page">
            <div className="page-title">
              <span className="section-title">Hardware Overview</span>
            </div>
            {hardwareShots
              .filter((h) => h.shots.length > 0)
              .map(({ model, shots }) => (
                <div key={model.id}>
                  <div className="views-model">{model.model_name}</div>
                  <div className="views-grid">
                    {shots.map((s, i) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img key={i} src={s.url} alt={`${model.model_name} ${s.slot}`} />
                    ))}
                  </div>
                </div>
              ))}
            {hasAnyImage && doc.image_note && <div className="image-note">{doc.image_note}</div>}
          </div>
          {lastSection === "hardware" && <Footer />}
          <div className="page-number">{nextPage()}</div>
        </div>
      )}

      {/* ═══ PACKAGE CONTENTS ═══ */}
      {showPackage && (
        <div className="page">
          <div className="top-bar" />
          <div className="body-page">
            <div className="page-title">
              <span className="section-title">Package Contents</span>
            </div>
            <MatrixTable rows={packageRows} cols={packageCols} heading="Package Contents" />
          </div>
          {lastSection === "package" && <Footer />}
          <div className="page-number">{nextPage()}</div>
        </div>
      )}

      {/* ═══ APPLICATION DIAGRAM (own page — only when there is no benefits page) ═══ */}
      {showDiagram && !diagramWithFeatures && diagram && (
        <div className="page">
          <div className="top-bar" />
          <div className="body-page">
            <div className="page-title">
              <span className="section-title">Application Diagram</span>
            </div>
            <div className="diagram">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={diagram.url} alt="Application diagram" />
            </div>
          </div>
          {lastSection === "diagram" && <Footer />}
          <div className="page-number">{nextPage()}</div>
        </div>
      )}
    </>
  );
}
