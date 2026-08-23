import React from "react";
import { ProjectPrintToolbar } from "@/components/preview/project-print-toolbar";
import { displayFontStack, MANROPE_IMPORT_URL } from "@/lib/datasheet/typography";
import { bulletDotCss } from "@/lib/datasheet/bullet";
import { PT, WT } from "@/lib/datasheet/scale";
import { getDict } from "@/lib/datasheet/locales";
import { CONTACT_US_URL } from "@/lib/datasheet/qr";
import { resolveMatrix } from "@/lib/project-datasheet/resolve";
import { getProjectTheme } from "@/lib/project-datasheet/themes";
import { LABEL_DOT_PT, LABEL_PT } from "@/lib/project-datasheet/label-geometry";
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
    return [
      {
        slot: img.slot || "product",
        url: img.url,
        caption: img.caption ?? null,
        prompt: img.prompt ?? null,
        body: Array.isArray(img.body) ? img.body : [],
        // Dropping this silently is how a label the author placed and saved
        // turns into an image that simply prints without it.
        labels: Array.isArray(img.labels) ? img.labels : [],
      },
    ];
  });
}

/**
 * "Rural and remote sites — where fixed line has not been built" is a name
 * and then an explanation. The scenarios page wants those in two different
 * type styles in two different places, so it needs them apart.
 *
 * Split rather than a second field: every caption already written uses this
 * shape, and a new field would have left them all with an empty heading until
 * someone re-typed them.
 */
function splitCaption(caption?: string | null): [string, string] {
  const text = (caption ?? "").trim();
  const at = text.indexOf("\u2014");
  if (at <= 0) return [text, ""];
  return [text.slice(0, at).trimEnd(), text.slice(at + 1).trim()];
}

function asSections(value: unknown): SectionToggles {
  if (!value || typeof value !== "object") return DEFAULT_SECTIONS;
  return { ...DEFAULT_SECTIONS, ...(value as Partial<SectionToggles>) };
}

export function ProjectPreview({
  doc,
  models,
  showToolbar,
  blockers = 0,
}: {
  doc: ProjectDatasheet;
  models: ProjectDatasheetModel[];
  showToolbar: boolean;
  /** open blocking findings, shown on the print bar */
  blockers?: number;
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
  /**
   * Every application illustration, in upload order. The first is the hero —
   * the detailed one that carries the wiring — and any others are scenario
   * vignettes shown as a row beneath it, which is the shape the supplier's
   * own "Application scenarios" block uses and the shape a reader expects.
   */
  const diagrams = docImages.filter((i) => i.slot === "diagram");
  const diagram = diagrams[0] ?? null;

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
  /**
   * The hero illustration goes under Features & Benefits; the scenario
   * vignettes get their own page after the specs.
   *
   * They are doing different jobs. The hero shows how the ONE product wires
   * up, which is the same argument the benefits are making, and it fills the
   * half page the benefits leave. The vignettes show the RANGE of sites it
   * suits — a separate claim, and one that reads better given room than
   * crammed under a benefits grid.
   *
   * With no benefits page, both fall back onto the standalone page.
   */
  const heroWithFeatures = showDiagram && sections.features && featureBlocks.length > 0;
  const scenarios = diagrams.slice(1);
  const showScenarioPage = showDiagram && (scenarios.length > 0 || !heroWithFeatures);

  // The footer rides the LAST page whichever section that turns out to be,
  // so toggling a section off can never orphan the disclaimer.
  const lastSection: string = showScenarioPage
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

  /**
   * "Ports and yards — outdoor mounting, cameras on the same run" is a name
   * and then an explanation. Splitting on the em dash lets the name carry the
   * weight, so the page can be scanned for the scenarios without reading
   * every sentence. A caption with no dash is left exactly as written.
   */
  const Caption = ({ text }: { text: string }) => {
    const at = text.indexOf("—");
    if (at <= 0) return <>{text}</>;
    return (
      <>
        <strong>{text.slice(0, at).trimEnd()}</strong>
        {" " + text.slice(at)}
      </>
    );
  };

  /* Measured, not guessed: 792pt page - 21pt top bar - 30pt top padding -
     the footer band leaves ~596pt, and the title eats ~32pt of it. 560 keeps
     a margin for a caption that wraps to two lines. Divided by the number of
     vignettes rather than fixed, so two get a half-page each and four still
     land on one page. 34pt per caption, not 26: at bodyMd a caption that
     wraps to two lines is 14pt taller, and the one that overran the footer
     band was the second of two.

     572 rather than the ~596 measured between the title and the footer band:
     a few points of it should stay empty, and at four rows 590 left only 12pt
     of clearance. Costs nothing at two or three rows, where the 58% width cap
     binds first and the height budget is never reached. */
  /* The labels are positioned against the wrapper, and the wrapper
     shrink-wraps the image, so a percentage means the same place on the
     picture no matter what size the page gives it. */
  const Illustration = ({ img, alt }: { img: ModelImage; alt: string }) => (
    <span className="img-wrap">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img.url} alt={alt} />
      {/* Leaders first, so the dots and the plates sit on top of them.
          preserveAspectRatio="none" makes the viewBox percentages line up with
          the label percentages exactly whatever the image's aspect; the stroke
          would be stretched with it, which `vector-effect` prevents. */}
      {(img.labels ?? []).some((l) => l.lx != null && l.ly != null) && (
        <svg className="img-leaders" viewBox="0 0 100 100" preserveAspectRatio="none">
          {(img.labels ?? []).map((l, i) =>
            l.lx != null && l.ly != null ? (
              <line
                key={i}
                x1={l.x}
                y1={l.y}
                x2={l.lx}
                y2={l.ly}
                vectorEffect="non-scaling-stroke"
              />
            ) : null,
          )}
        </svg>
      )}
      {(img.labels ?? []).map((l, i) => (
        <span key={i}>
          <span className="img-dot" style={{ left: `${l.x}%`, top: `${l.y}%` }} />
          <span
            className={
              l.lx != null && l.ly != null ? "img-label placed" : `img-label ${l.side ?? "right"}`
            }
            style={
              l.lx != null && l.ly != null
                ? { left: `${l.lx}%`, top: `${l.ly}%` }
                : { left: `${l.x}%`, top: `${l.y}%` }
            }
          >
            {l.text}
          </span>
        </span>
      ))}
    </span>
  );

  const ScenarioRow = ({ items, big }: { items: ModelImage[]; big: boolean }) => {
    /* One row per scenario, sharing the page evenly rather than each taking a
       fixed height — so adding a fourth shrinks all four instead of pushing
       one onto a page of its own. */
    const each = Math.floor((572 - (items.length - 1) * 16) / Math.max(items.length, 1));
    return (
      <div
        className={`scenarios${big ? " big" : ""}`}
        style={big ? ({ "--scenario-h": `${each}pt` } as React.CSSProperties) : undefined}
      >
        {items.map((d, i) => {
          const [head, lead] = splitCaption(d.caption);
          const bullets = (d.body ?? []).filter((b) => b.trim());
          return (
            <div className="scenario" key={i}>
              <Illustration img={d} alt={head || "Application scenario"} />
              {big ? (
                <div className="scenario-copy">
                  {head && <div className="scenario-head">{head}</div>}
                  {lead && <div className="scenario-lead">{lead}</div>}
                  {bullets.length > 0 && (
                    <ul className="block-body">
                      {bullets.map((t, j) => (
                        <li key={j}>
                          <span className="dot" />
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                d.caption && (
                  <div className="scenario-cap">
                    <Caption text={d.caption} />
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
    );
  };

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
          <div className="footer-version">
            {doc.confidentiality ? `${doc.confidentiality}  ·  ` : ""}
            {today}
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
      {showToolbar && <ProjectPrintToolbar id={doc.id} name={doc.name} blockers={blockers} />}
      {/* ⚠️ Everything below is ONE template literal. A backtick inside a CSS
          comment — quoting a property name, say — closes it, and the parse
          error lands on a line nowhere near the comment. Write property names
          plainly: object-fit: contain, not the quoted form. */}
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
.prelim-conf {
  font-weight: ${WT.bold}; letter-spacing: .04em; color: #a15c07; margin-bottom: 2pt;
}

/* ── features & benefits ───────────────────────────────────────────── */
.body-page {
  padding: 30pt 44pt 34pt; height: calc(792pt - 21pt);
  display: flex; flex-direction: column;
}
/* The footer is absolutely positioned over the bottom of the page, so a page
   that carries one has to keep its content above it. */
.body-page.with-footer { padding-bottom: 104pt; }
.page-title { margin-bottom: 18pt; }
.blocks { display: grid; grid-template-columns: 1fr 1fr; gap: 14pt 24pt; }
/* Give the diagram the rest of the page rather than a fixed height — the
   benefits list is written per deal and its length is not predictable. */
.blocks.with-diagram { flex: none; }
.diagram-block { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.deploy {
  flex: 1; min-height: 0; margin-top: 18pt;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
}
/* A capped natural size rather than object-fit: contain letterboxes, so the
   element box stays the size of its container while the painted image sits
   somewhere inside it, so a label at 50%/50% of the ELEMENT lands nowhere
   near the middle of the picture. Sized by max-height with auto width the
   element and the picture are the same rectangle, and the wrapper the labels
   are positioned against shrink-wraps to exactly that. */
.deploy img { display: block; width: auto; height: auto; max-width: 100%; max-height: 250pt; }
/* On a page of their own the scenarios read as rows: picture on the left,
   what it is on the right.

   A one-line caption under a picture can only name the scene. A column beside
   it has room to say why that scene is a reason to buy, which is what a
   tender reader is actually looking for — and it uses the width that a
   caption centred under a picture throws away.

   Centred in the space left over rather than pinned to the title, so a page
   of two rows and a page of four both look deliberate. */
.scenarios.big {
  flex: 1; min-height: 0; flex-direction: column; align-items: stretch;
  justify-content: center; gap: 16pt; margin-top: 18pt;
}
.scenarios.big .scenario {
  flex: none; display: flex; align-items: center; gap: 22pt; text-align: left;
}
/* Height-bound first, then capped at 58% of the row. The wrapper has to
   shrink-wrap the picture — that is what makes a label at 40%/60% land in the
   same place on paper as it did in the editor — so the width cap goes on the
   wrapper and the picture fills it, rather than the wrapper being sized on
   its own and the picture floating inside it. */
.scenarios.big .scenario > .img-wrap { flex: 0 0 auto; max-width: 58%; }
.scenarios.big .scenario img {
  display: block; width: auto; height: auto;
  max-width: 100%; max-height: var(--scenario-h);
}
.scenario-copy { flex: 1; min-width: 0; }
.scenario-head {
  font-family: ${displayFont}; font-size: ${PT.bodyMd}pt; font-weight: ${WT.semi};
  color: ${theme.primary}; margin-bottom: 5pt; line-height: 1.3;
}
.scenario-lead {
  font-size: ${PT.bodySm}pt; line-height: 1.5; color: ${MUTED}; margin-bottom: 5pt;
}
.scenario-copy .block-body { font-size: ${PT.bodySm}pt; }
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
  display: flex; gap: 20pt; justify-content: center; align-items: flex-start;
  flex-wrap: wrap; margin-bottom: 10pt;
}
.view { text-align: center; }
.views-grid img {
  display: block; max-width: 210pt; max-height: 250pt; object-fit: contain;
  margin: 0 auto;
}
.view-cap {
  font-size: ${PT.bodySm}pt; font-weight: ${WT.semi}; color: ${MUTED};
  margin-top: 6pt;
}
.views-model {
  font-family: ${displayFont}; font-size: ${PT.bodyMd}pt; font-weight: ${WT.semi};
  color: ${INK}; margin: 14pt 0 6pt;
}
.image-note {
  font-size: ${PT.table}pt; font-style: italic; color: ${MUTED}; margin-top: 10pt;
}
.diagram-copy { margin-top: 18pt; }
.diagram-title {
  font-family: ${displayFont}; font-size: ${PT.bodyMd}pt; font-weight: ${WT.semi};
  color: ${theme.primary}; margin-bottom: 3pt;
}
.diagram-note {
  font-size: ${PT.bodySm}pt; line-height: 1.55; color: ${MUTED}; max-width: 470pt;
  margin-bottom: 4pt;
}
/* Scenario vignettes: equal columns so they read as a set, not a sequence. */
.scenarios { display: flex; gap: 16pt; margin-top: 14pt; }
.scenario { flex: 1; min-width: 0; text-align: center; }
.scenario img { width: 100%; max-height: 118pt; object-fit: contain; }
.scenario-cap {
  font-size: ${PT.bodySm}pt; color: ${MUTED}; margin-top: 4pt; line-height: 1.4;
}
/* The half before the em dash names the scene; the half after explains it.
   Bolding the name lets someone scanning the page collect the scenarios
   without reading the sentences. */
.scenario-cap strong { font-weight: ${WT.semi}; color: ${INK}; }

/* A word printed on the illustration itself. Positioned as a percentage of
   the image box, so it stays put whatever height the page gives the image.
   The pale plate behind it is what keeps it readable over line art without
   having to know what is underneath. */
.img-wrap { position: relative; display: inline-block; line-height: 0; max-width: 100%; }
/* The dot marks the thing; the text sits beside it. A box centred on the
   point covers whatever was being pointed at, which on an application
   diagram is the one thing the picture is for. */
.img-dot {
  position: absolute; width: ${LABEL_DOT_PT}pt; height: ${LABEL_DOT_PT}pt; border-radius: 50%;
  background: ${theme.primary}; transform: translate(-50%, -50%);
  box-shadow: 0 0 0 1.2pt rgba(255, 255, 255, 0.95);
}
.img-label {
  position: absolute;
  font-size: ${LABEL_PT}pt; font-weight: ${WT.semi}; color: ${theme.primary};
  background: rgba(255, 255, 255, 0.92); border: 0.5pt solid #d8dfe6;
  border-radius: 2pt; padding: 1.5pt 4pt; white-space: nowrap; line-height: 1.25;
}
.img-leaders {
  position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible;
}
.img-leaders line { stroke: ${theme.primary}; stroke-width: 0.6pt; opacity: 0.55; }
/* Freely placed: the text is centred on its own point and a leader runs back
   to the thing it names. A fixed offset from the dot cannot clear a device —
   how far it would have to move depends on how large that device is drawn. */
.img-label.placed { transform: translate(-50%, -50%); }
.img-label.right { transform: translate(7pt, -50%); }
.img-label.left { transform: translate(-100%, -50%) translateX(-7pt); }
.img-label.top { transform: translate(-50%, -100%) translateY(-7pt); }
.img-label.bottom { transform: translate(-50%, 0) translateY(7pt); }

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
          {/* Two separate claims, so two lines: PRELIMINARY is about the
              numbers still moving, CONFIDENTIAL is about who may see the
              document. One cannot stand in for the other. */}
          {doc.confidentiality && <div className="prelim-conf">{doc.confidentiality}</div>}
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
            <div className={`blocks${heroWithFeatures ? " with-diagram" : ""}`}>
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
            {heroWithFeatures && diagram && (
              <div className="diagram-block">
                {(doc.diagram_title || doc.diagram_note) && (
                  <div className="diagram-copy">
                    {doc.diagram_title && (
                      <div className="diagram-title">{doc.diagram_title}</div>
                    )}
                    {doc.diagram_note && <div className="diagram-note">{doc.diagram_note}</div>}
                  </div>
                )}
                <div className="deploy">
                  <Illustration img={diagram} alt="Application diagram" />
                </div>
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
                      <div className="view" key={i}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.url} alt={`${model.model_name} ${s.slot}`} />
                        {/* Which face this is. Two renders of a white box side
                            by side are not self-explanatory, and on a tender
                            sheet "where does the SIM go" is a real question. */}
                        {s.caption && <div className="view-cap">{s.caption}</div>}
                      </div>
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

      {/* ═══ APPLICATION SCENARIOS (own page, after the specs) ═══
           Fixed heading, NOT `diagram_title`. The two pages stopped being the
           same thing: page 2 carries one architecture diagram — how the parts
           connect — and this page carries the places it gets installed. They
           shared a title field while they shared a subject, and kept sharing it
           for one revision after they stopped, which put "System architecture"
           over a page of sites. */}
      {showScenarioPage && diagram && (
        <div className="page">
          <div className="top-bar" />
          <div className="body-page with-footer">
            <div className="page-title">
              <span className="section-title">Application scenarios</span>
            </div>
            {!heroWithFeatures && doc.diagram_note && (
              <div className="diagram-note">{doc.diagram_note}</div>
            )}
            <div className="diagram-block">
              {!heroWithFeatures && (
                <div className="deploy">
                  <Illustration img={diagram} alt="Application diagram" />
                </div>
              )}
              {scenarios.length > 0 && <ScenarioRow items={scenarios} big={heroWithFeatures} />}
            </div>
          </div>
          {lastSection === "diagram" && <Footer />}
          <div className="page-number">{nextPage()}</div>
        </div>
      )}
    </>
  );
}
