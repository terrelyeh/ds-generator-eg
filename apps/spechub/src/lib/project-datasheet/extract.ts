/**
 * Source extraction — a supplier's spec sheet into `raw_doc` rows.
 *
 * Three input kinds, one output shape. PDF and XLSX both normalise to page
 * text before anything else looks at them, so the structuring step has one
 * input format instead of three and a new kind costs a reader function.
 *
 * ── Faithful, not helpful ───────────────────────────────────────────────
 * Extraction reads; it does not improve. Units stay as written, fullwidth
 * punctuation stays fullwidth, "＜24W（POE 48V/0.6A）" comes through exactly
 * like that. Every cleanup is a human edit and belongs in `rules`, where it
 * shows up in the gap review as a change someone made — the whole point of
 * keeping `raw_doc` immutable is that it stays comparable to the PDF a
 * customer might one day wave at us.
 *
 * ── Why not OCR ─────────────────────────────────────────────────────────
 * The ODM sheets that started this module are WPS exports with a clean text
 * layer; `pdftotext -layout` reads them almost perfectly. Reaching for vision
 * models on a document that already carries its own text would be slower,
 * costlier and less accurate. A scanned source is a real case, but it is not
 * this case, and the extractor says so rather than silently returning
 * nothing.
 */

import type { RawSpecRow } from "./types";
import { normalizeKey } from "./resolve";

export type SourceKind = "pdf" | "xlsx" | "text";

export interface ExtractedText {
  /** one entry per PDF page / spreadsheet sheet; index 0 is "page 1" */
  pages: string[];
  /** everything joined, for the residue scanner and the record */
  full: string;
}

/** A PDF whose text layer is this thin is almost certainly scanned. */
const MIN_CHARS_PER_PAGE = 40;

export async function readPdf(buf: ArrayBuffer): Promise<ExtractedText> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [String(text)];

  const meaningful = pages.filter((p) => p.trim().length >= MIN_CHARS_PER_PAGE);
  if (meaningful.length === 0) {
    throw new Error(
      "這個 PDF 沒有文字層（大概是掃描檔或整頁圖片）。目前只能讀有文字的 PDF —— " +
        "請跟原廠要可複製文字的版本，或把規格表貼成文字。",
    );
  }
  return { pages, full: pages.join("\n\n") };
}

export async function readXlsx(buf: ArrayBuffer): Promise<ExtractedText> {
  // exceljs rather than the registry's `xlsx`, whose latest published build
  // still carries an unfixed prototype-pollution and a ReDoS advisory — in
  // the parser itself, which is precisely the code path an uploaded supplier
  // file goes through.
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  const pages: string[] = [];
  wb.eachSheet((sheet) => {
    const lines: string[] = [`# ${sheet.name}`];
    sheet.eachRow((row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        const v = cell.value;
        cells.push(
          v == null
            ? ""
            : typeof v === "object" && "richText" in v
              ? (v.richText as { text: string }[]).map((r) => r.text).join("")
              : typeof v === "object" && "text" in v
                ? String((v as { text: unknown }).text)
                : String(v),
        );
      });
      // Tab-separated, which is what the structuring step reads best and
      // what a copied table looks like anyway.
      if (cells.some((c) => c.trim())) lines.push(cells.join("\t").replace(/\t+$/, ""));
    });
    pages.push(lines.join("\n"));
  });

  if (pages.length === 0) throw new Error("這個 Excel 檔沒有任何工作表。");
  return { pages, full: pages.join("\n\n") };
}

export function readText(text: string): ExtractedText {
  return { pages: [text], full: text };
}

// ── structuring ────────────────────────────────────────────────────────────

export const EXTRACT_SYSTEM = `You read a hardware spec sheet and return its specification TABLE as rows.

Return ONLY a JSON object: {"rows":[...], "notes":"<one line, or empty>"}

Each row:
  {"label":"<as printed>","value":"<as printed>","group":"spec|software|package","source_page":<1-based>,"confidence":<0-1>}

Rules you must follow:

1. Copy values EXACTLY as printed. Do not convert units, fix spacing, expand
   abbreviations, translate, or tidy fullwidth punctuation. "＜24W（POE
   48V/0.6A）" is returned exactly like that. You are transcribing, not
   editing — someone else decides what to change, and they need to see what
   the source actually said.
2. Keep multi-line values as multi-line: join the lines with \\n. A band list
   printed over four lines is ONE value, not four rows.
3. group:
     "spec"     the technical specification table (default)
     "software" a firmware / function / feature-menu table
     "package"  package or box contents
4. Skip marketing prose, headings, page numbers, footers, image captions and
   application-scenario lists. Only tabular specification content.
5. source_page is the 1-based page the row was printed on.
6. confidence: 1 when the label and value are unambiguous in the source;
   lower when you had to infer a row boundary or a column split. Be honest —
   a low score is a flag for a human, not a failure.
7. If a page has no specification table, contribute nothing from it.
8. "notes" is for one line about anything odd (a table you could not read, a
   column you had to guess). Leave it empty when there is nothing to say.

Do not add commentary outside the JSON.`;

export function buildExtractPrompt(pages: string[], modelHint: string | null): string {
  const body = pages
    .map((p, i) => `----- PAGE ${i + 1} -----\n${p.trim()}`)
    .join("\n\n");
  return [
    modelHint
      ? `This sheet describes the supplier model "${modelHint}". Return its specs.`
      : "Return the specification table from this sheet.",
    "",
    body,
  ].join("\n");
}

export interface ExtractResult {
  rows: RawSpecRow[];
  notes: string;
}

/** Parse the reply, dropping rows we cannot use. */
export function parseExtraction(raw: string): ExtractResult {
  const json = extractJson(raw);
  if (!json) return { rows: [], notes: "" };

  const rows: RawSpecRow[] = [];
  for (const entry of Array.isArray(json.rows) ? json.rows : []) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    // A label that wrapped across two lines in the PDF comes back with the
    // break in it ("4G&3G Frequency\nBands"). Values keep their newlines —
    // they are often genuinely multi-line — but a label never is.
    const label =
      typeof e.label === "string" ? e.label.replace(/\s+/g, " ").trim() : "";
    if (!label) continue;
    const value = typeof e.value === "string" ? e.value : "";
    const group = typeof e.group === "string" ? e.group.toLowerCase() : "spec";
    rows.push({
      key: normalizeKey(label),
      label,
      value,
      group: ["spec", "software", "package"].includes(group) ? group : "spec",
      source_page: typeof e.source_page === "number" ? e.source_page : null,
      confidence: typeof e.confidence === "number" ? clamp(e.confidence) : null,
    });
  }

  // A source that lists the same label twice (continued table, repeated
  // header) would otherwise produce two rows with one key, and only one of
  // them would survive resolution — silently, and not necessarily the right
  // one. Merging keeps both halves of a split table.
  const merged = new Map<string, RawSpecRow>();
  for (const row of rows) {
    const seen = merged.get(row.key);
    if (!seen) {
      merged.set(row.key, row);
    } else if (row.value.trim() && !seen.value.includes(row.value.trim())) {
      seen.value = `${seen.value}\n${row.value}`.trim();
      seen.confidence = Math.min(seen.confidence ?? 1, row.confidence ?? 1);
    }
  }

  return {
    rows: [...merged.values()],
    notes: typeof json.notes === "string" ? json.notes.trim() : "",
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function extractJson(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** How much source text to send. Enough for a 10-page ODM sheet. */
export const MAX_SOURCE_CHARS = 60_000;

export function trimPages(pages: string[], budget = MAX_SOURCE_CHARS): string[] {
  const out: string[] = [];
  let used = 0;
  for (const page of pages) {
    if (used >= budget) break;
    const slice = page.slice(0, budget - used);
    out.push(slice);
    used += slice.length;
  }
  return out;
}
