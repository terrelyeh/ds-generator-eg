import React from "react";
import { ProjectPrintToolbar } from "@/components/preview/project-print-toolbar";
import { displayFontStack, MANROPE_IMPORT_URL } from "@/lib/datasheet/typography";
import { bulletDotCss } from "@/lib/datasheet/bullet";
import { PT, WT } from "@/lib/datasheet/scale";
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

/** ~chars per line in a value column of `width` pt at 7pt. */
function estRows(text: string, width: number): number {
  const perLine = Math.max(8, Math.floor(width / (0.5 * 7)));
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

  const showSoftware = sections.software && softwareRows.length > 0 && softwareCols.length > 0;
  const showPackage = sections.package && packageRows.length > 0 && packageCols.length > 0;
  const showHardware = sections.hardware && hardwareShots.some((h) => h.shots.length > 0);
  const showDiagram = sections.diagram && !!diagram;

  // The footer rides the LAST page whichever section that turns out to be,
  // so toggling a section off can never orphan the disclaimer.
  const lastSection: string = showDiagram
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
      <div className="footer-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo/EnGenius-Logo-gray.png" alt="EnGenius" />
      </div>
      <div className="footer-note">{doc.disclaimer}</div>
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
.cover-body { padding: 124pt 44pt 0; }
.hero-title {
  font-size: ${PT.cover}pt; font-weight: ${WT.bold}; color: ${INK};
  line-height: 1.18; margin-bottom: 4pt;
}
.hero-series {
  font-size: ${PT.lead}pt; font-weight: ${WT.medium}; color: ${theme.primary};
  margin-bottom: 16pt;
}
.cover-overview {
  font-size: ${PT.bodySm}pt; line-height: 1.6; color: ${MUTED};
  white-space: pre-line; max-width: 470pt;
}
.cover-shots {
  display: flex; gap: 24pt; justify-content: center; align-items: flex-end;
  margin-top: 22pt; min-height: 250pt;
}
.cover-shot { flex: 1; text-align: center; max-width: 240pt; }
.cover-shot img { max-width: 100%; max-height: 230pt; object-fit: contain; }
.cover-shot .cs-name {
  font-family: ${displayFont}; font-size: ${PT.bodyMd}pt; font-weight: ${WT.semi};
  color: ${INK}; margin-top: 8pt;
}
.cover-shot .cs-desc { font-size: ${PT.tableSm}pt; color: ${MUTED}; margin-top: 2pt; }

/* PRELIMINARY strip. On the cover, not only the footer — this document's
   whole risk is that it looks exactly like a real datasheet, and the cover
   is the page that gets screenshotted into an email. */
.prelim {
  position: absolute; left: 44pt; right: 44pt; bottom: 44pt;
  border-left: 3pt solid ${theme.primary}; background: ${theme.featuresBox};
  padding: 8pt 12pt; font-size: ${PT.tableSm}pt; line-height: 1.5; color: ${INK};
}

/* ── features & benefits ───────────────────────────────────────────── */
.body-page { padding: 30pt 44pt 0; height: calc(792pt - 21pt); }
.page-title { margin-bottom: 18pt; }
.blocks { display: grid; grid-template-columns: 1fr 1fr; gap: 14pt 24pt; }
.block {
  background: ${theme.featuresBox}; border-radius: 3pt; padding: 12pt 14pt;
}
.block-title {
  font-size: ${PT.bodyMd}pt; font-weight: ${WT.semi}; color: ${theme.primary};
  margin-bottom: 5pt;
}
.block-body { font-size: ${PT.bodySm}pt; line-height: 1.55; color: ${MUTED}; }
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
  font-size: ${PT.table}pt; padding: 5pt 8pt; letter-spacing: .02em;
}
.model-row td {
  background: ${theme.bandLight}; color: #fff; font-weight: ${WT.semi};
  font-size: ${PT.table}pt; padding: 4pt 8pt; border-right: 1pt solid #fff;
}
.spec-row td {
  font-size: ${PT.tableSm}pt; line-height: 1.4; padding: 4pt 8pt;
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
  font-size: ${PT.tableSm}pt; font-style: italic; color: ${MUTED}; margin-top: 10pt;
}
.diagram img { max-width: 100%; max-height: 420pt; object-fit: contain; }
.diagram { text-align: center; }

/* ── footer ────────────────────────────────────────────────────────── */
.footer {
  position: absolute; left: 44pt; right: 44pt; bottom: 36pt;
  border-top: .5pt solid #d5d8da; padding-top: 8pt;
}
.footer-logo img { height: 15pt; margin-bottom: 5pt; }
.footer-note { font-size: ${PT.footer}pt; line-height: 1.5; color: ${MUTED}; }
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
        <div className="prelim">{doc.disclaimer}</div>
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
            <div className="blocks">
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

      {/* ═══ APPLICATION DIAGRAM ═══ */}
      {showDiagram && diagram && (
        <div className="page">
          <div className="top-bar" />
          <div className="body-page">
            <div className="page-title">
              <span className="section-title">Deployment</span>
            </div>
            <div className="diagram">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={diagram.url} alt="Deployment diagram" />
            </div>
            {doc.image_note && <div className="image-note">{doc.image_note}</div>}
          </div>
          {lastSection === "diagram" && <Footer />}
          <div className="page-number">{nextPage()}</div>
        </div>
      )}
    </>
  );
}
