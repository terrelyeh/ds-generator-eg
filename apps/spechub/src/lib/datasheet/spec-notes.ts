/**
 * Spec footnotes — the "*Note: …" lines under a datasheet's spec table.
 *
 * Maintained by PMs in the master sheet: a `Spec Footnote` row on the Web
 * Overview tab, one column per model, one note per line. The marker is part
 * of the text the PM writes (`*`, `**`), because the matching marker lives in
 * the spec value itself (`6.8G*`) and only the author knows which is which —
 * nothing here generates or renumbers markers.
 *
 * Why not a row on Detail Specs, where the markers are: that tab reads
 * "text in column A, model columns empty" as a NEW CATEGORY HEADER
 * (`sheets.ts` isRowOnlyLabel), so a note row there would silently swallow
 * every spec below it.
 *
 * Resolution order, so nothing regresses for the one line that had a footnote
 * before this existed (Cloud VPN Firewall, set by hand in SQL):
 *   the product's own notes for this locale → its English notes →
 *   the product line's footnote for this locale → its English footnote.
 * A product that sets any note of its own replaces the line's, rather than
 * adding to it — two sources stacking under one table is how you end up with
 * two "*Note:" lines that contradict each other.
 */

/** One note per line; blank lines dropped. The marker stays in the text. */
export function parseSpecNotes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export interface SpecNoteSources {
  /** products.spec_notes — the Web Overview "Spec Footnote" cell, verbatim. */
  productNotes?: string | null;
  /** product_translations.spec_notes for the locale being printed. */
  translatedNotes?: string | null;
  /** product_lines.spec_footnote — the pre-existing line-wide note. */
  lineFootnote?: string | null;
  /** product_lines.spec_footnote_translations, keyed by locale. */
  lineFootnoteTranslations?: Record<string, string> | null;
  /** "en" | "ja" | "zh-TW" | "es-MX" … */
  locale?: string;
}

export function resolveSpecNotes(sources: SpecNoteSources): string[] {
  const locale = sources.locale ?? "en";
  if (locale !== "en") {
    const translated = parseSpecNotes(sources.translatedNotes);
    if (translated.length) return translated;
  }
  const own = parseSpecNotes(sources.productNotes);
  if (own.length) return own;

  if (locale !== "en") {
    const lineTranslated = parseSpecNotes(sources.lineFootnoteTranslations?.[locale]);
    if (lineTranslated.length) return lineTranslated;
  }
  return parseSpecNotes(sources.lineFootnote);
}

// ---------------------------------------------------------------------------
// Height, so the paginators can keep the last page from eating the notes
// ---------------------------------------------------------------------------

/**
 * Characters per line across the FULL content width at the footnote's size.
 * The spec columns count 52 at their own width and font size (pagination.ts);
 * the note spans both columns plus the gutter at a smaller size, which is
 * roughly 125 — kept at 110 deliberately so the estimate rounds UP into more
 * reserved space rather than less.
 */
const CHARS_PER_LINE = 110;
/** PT.tableSm (7pt) × line-height 1.55, rounded up. */
const LINE_HEIGHT = 11;
/** `.spec-footnote { margin-top: 16pt }` — the gap above the block. */
const BLOCK_MARGIN = 16;

const charWidth = (ch: string) => (/[　-鿿＀-￯]/.test(ch) ? 2 : 1);

/**
 * Printed height of the note block in pt, 0 when there are no notes.
 *
 * Pagination must subtract this from the LAST spec page's budget. Before this
 * existed the single footnote just leaned on the 72pt bottom margin, and
 * `.page` is `overflow: hidden` — a block that outgrew the margin was cut off
 * with nothing reporting it (pitfall #69).
 */
// ---------------------------------------------------------------------------
// Do the markers in the notes and in the spec values agree?
// ---------------------------------------------------------------------------

/**
 * What counts as a footnote marker: a run of asterisks or daggers.
 *
 * Numeric `(2)` deliberately does NOT count. Cloud AP spec values are full of
 * "Four(4) spatial stream" and "one(1) two streams" — a first version of this
 * check treated those as markers and reported 34 models as broken, none of
 * which were.
 */
const MARKER = String.raw`\*{1,4}|†{1,2}|‡{1,2}`;

/** The marker each note opens with, e.g. "** Wi-Fi 7 …" → "**". */
export function markersInNotes(notes: string[]): string[] {
  const seen = new Set<string>();
  for (const note of notes) {
    const match = new RegExp(`^(${MARKER})`).exec(note);
    if (match) seen.add(match[1]);
  }
  return [...seen];
}

/**
 * Markers hanging off the end of a spec value, e.g. "6.8G*" → "*".
 *
 * Has to be attached to the end of a word and followed by a break, so the
 * asterisk inside "Four(4)"-style prose or a stray "*" on its own line isn't
 * counted.
 */
export function markersInValues(values: string[]): string[] {
  const pattern = new RegExp(`(?<=[\\p{L}\\p{N}%)\\]])(${MARKER})(?=[\\s,;)]|$)`, "gu");
  const seen = new Set<string>();
  for (const value of values) {
    for (const line of value.split(/\r?\n/)) {
      for (const match of line.matchAll(pattern)) seen.add(match[1]);
    }
  }
  return [...seen];
}

/**
 * Markers that don't line up: a value marked `**` with no note explaining it,
 * or a note nobody points at. Both are silent in the PDF — the reader just
 * sees an asterisk that leads nowhere.
 */
export function checkSpecNoteMarkers(input: { notes: string[]; values: string[] }): {
  valuesWithoutNote: string[];
  notesWithoutValue: string[];
} {
  const inNotes = markersInNotes(input.notes);
  const inValues = markersInValues(input.values);
  return {
    valuesWithoutNote: inValues.filter((m) => !inNotes.includes(m)),
    notesWithoutValue: inNotes.filter((m) => !inValues.includes(m)),
  };
}

export function estimateSpecNotesHeight(notes: string[]): number {
  if (!notes.length) return 0;
  let lines = 0;
  for (const note of notes) {
    let width = 0;
    for (const ch of note) width += charWidth(ch);
    lines += Math.max(1, Math.ceil(width / CHARS_PER_LINE));
  }
  return BLOCK_MARGIN + lines * LINE_HEIGHT;
}
