/**
 * Which of a model's older PDFs in Supabase Storage can go.
 *
 * Every Generate leaves a PDF in Storage (`datasheets/<model>/…`) and in
 * Drive. Storage only needs the copies something still links to — the
 * current version per language (Open PDF, the product page) and any version
 * marked on the 官網 tab (`lib/website/baseline.ts` reads its Storage size).
 * Nothing pruned them, and on 2026-10-12 superseded copies pushed the
 * project past the Free plan's 1 GB Storage quota: Supabase answered 402 to
 * every API call and both apps went down.
 *
 * Drive is the archive, but it is not complete: of 179 superseded copies
 * found that day, 53 existed nowhere else (same-day iterations; Drive only
 * held the last one). So a copy is only prunable when the Drive folder this
 * Generate just wrote to holds a file of the same name. Anything without
 * that proof stays — including PDFs from an older `ds_prefix`, which never
 * share a folder with the current one.
 */

const PDF_NAME = /_v(\d+)\.(\d+)(?:_([a-z]+))?\.pdf$/;

export interface ParsedPdfName {
  version: string;
  /** Locale suffix as it appears in file names (`ja`, `zh`, `es`); null = English. */
  suffix: string | null;
}

export function parsePdfName(name: string): ParsedPdfName | null {
  const m = name.match(PDF_NAME);
  if (!m) return null;
  return { version: `${Number(m[1])}.${Number(m[2])}`, suffix: m[3] ?? null };
}

export interface PruneInput {
  /** File names (not paths) under `datasheets/<model>/`. */
  storageNames: string[];
  /** The file this Generate wrote. Never pruned. */
  currentName: string;
  /** Locale suffix of this Generate; only that language's files are considered. */
  suffix: string | null;
  /** Versions marked on the 官網 tab for this language. Kept. */
  markedVersions: string[];
  /** File names present in the Drive folder this Generate uploaded to. */
  driveNames: string[];
}

export function pickPrunable(input: PruneInput): string[] {
  const marked = new Set(input.markedVersions);
  const inDrive = new Set(input.driveNames);
  return input.storageNames.filter((name) => {
    if (name === input.currentName) return false;
    const parsed = parsePdfName(name);
    if (!parsed || parsed.suffix !== input.suffix) return false;
    if (marked.has(parsed.version)) return false;
    return inDrive.has(name);
  });
}
