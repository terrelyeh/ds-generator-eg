/**
 * Project Datasheet Builder — shared shapes for on-demand datasheets.
 *
 * These describe the jsonb columns of `project_datasheets` and
 * `project_datasheet_models` (migration 00038). The DB types say `Json`
 * because Postgres does; this file says what that Json actually is.
 */

/** One row as it came out of the source document. */
export interface RawSpecRow {
  /** normalised label — the stable key every rule is written against */
  key: string;
  /** label as it should print */
  label: string;
  value: string;
  /** page of the source PDF this came off, for the provenance trail */
  source_page?: number | null;
  /** 0–1 from the extractor; null for hand-entered rows */
  confidence?: number | null;
  /**
   * Which table the row prints in: 'spec' (default), 'software', 'package'.
   * The source documents keep these as separate tables and so do we — a
   * firmware feature list and an electrical spec answer different questions
   * and a reader scanning for one shouldn't wade through the other.
   */
  group?: string;
}

/** What to print in a cell the source never filled. */
export type BlankMode = "tbd" | "na" | "blank";

/** A row added by hand rather than lifted from the source. */
export interface AddedRow {
  key: string;
  label: string;
  value: string;
  /** insert after this key; appended when absent or not found */
  after?: string | null;
  /** which table it joins — defaults to the main spec table */
  group?: string;
}

/**
 * Human edits. Both the document (`project_datasheets.doc_rules`) and each
 * column (`project_datasheet_models.rules`) carry a set; the model's layers
 * on top. `add` is model-only — a new row needs its own value per column.
 */
export interface SpecRules {
  hide?: string[];
  override?: Record<string, string>;
  rename?: Record<string, string>;
  blank?: Record<string, BlankMode>;
  add?: AddedRow[];
}

/** Document-level rules accept everything except `add`. */
export type DocRules = Omit<SpecRules, "add">;

/** Where a printed cell came from — drives the provenance colouring. */
export type CellOrigin = "source" | "override" | "added" | "blank";

export interface ResolvedCell {
  /** exactly what to print, blank placeholder included */
  value: string;
  origin: CellOrigin;
  /** true when `value` is a placeholder rather than real content */
  isBlank: boolean;
  sourcePage?: number | null;
}

export interface ResolvedRow {
  key: string;
  label: string;
  /** 'spec' | 'software' | 'package' — which table this row belongs to */
  group: string;
  /** one per model, in model order */
  cells: ResolvedCell[];
}

/** Which sections of the document render. */
export interface SectionToggles {
  features: boolean;
  specs: boolean;
  software: boolean;
  hardware: boolean;
  package: boolean;
  diagram: boolean;
}

export const DEFAULT_SECTIONS: SectionToggles = {
  features: true,
  specs: true,
  software: false,
  hardware: true,
  package: false,
  diagram: false,
};

/** A shared feature/benefit block on the cover or the benefits page. */
export interface FeatureBlock {
  title: string;
  bullets: string[];
}

/**
 * A word printed ON an illustration, positioned as a percentage of the
 * image's own box (not the page), so it survives the image being scaled to
 * whatever height the layout gives it.
 *
 * Typeset by the renderer, never baked into the raster. Asking an image
 * model for the label is the obvious shortcut and it does not work: "EOR200"
 * comes back as "E0R2OO", "802.3af/at" as something that merely looks like a
 * standard. A wrong part number on a tender document is worse than no label.
 * Drawn by the layout it is real type, editable after the fact, translatable,
 * and sharp at print resolution.
 */
export interface ImageLabel {
  /** 0–100, from the left edge of the image */
  x: number;
  /** 0–100, from the top edge of the image */
  y: number;
  text: string;
  /**
   * Which way the text sits from the point.
   *
   * The point marks the thing; the text sits BESIDE it. Centring the box on
   * the point — the first version — meant that clicking the device you wanted
   * to name covered the device you wanted to show, which is the one thing an
   * application diagram exists to do.
   */
  side?: LabelSide;
}

export type LabelSide = "right" | "left" | "top" | "bottom";

export const LABEL_SIDES: LabelSide[] = ["right", "left", "top", "bottom"];

/** One image attached to a model column. */
export interface ModelImage {
  /** 'product' for the cover shot, anything else lands on the hardware page */
  slot: string;
  url: string;
  /**
   * On the scenarios page this is the heading, not a sentence under the
   * picture. Existing captions written as "Name — explanation" still work:
   * the layout splits on the dash and the tail becomes the opening line of
   * the copy, so nothing already typed has to be re-entered.
   */
  caption?: string | null;
  /** Bullets in the copy column beside the image. One string per bullet. */
  body?: string[] | null;
  labels?: ImageLabel[] | null;
}
