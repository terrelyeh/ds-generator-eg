/**
 * The decisions behind an incremental GitBook re-crawl, as pure functions.
 *
 * `ingestGitbook` is only affordable because most pages are NOT fetched: a
 * page is skipped when its sitemap `<lastmod>` matches what it was indexed
 * at, and a fetched page skips Vision when its text and images are exactly
 * what was described last time. Each of those skips had a way to stop
 * working without anything failing — the weekly job just got slower until it
 * could no longer finish in 300s (2026-09-06 and 09-13, both timed out) —
 * so the rules live here, where they can be tested.
 */
import { createHash } from "node:crypto";

/**
 * chunk_index of a page's "focused" LED-table chunk. One per page.
 *
 * It used to be 10000 + a counter that ran across every page of the run, so
 * the same page's table got a different index depending on which other
 * pages happened to be re-crawled with it — and the stale-chunk cleanup,
 * which only knew about heading chunks, deleted it on every re-crawl.
 */
export const FOCUSED_CHUNK_INDEX = 10_000;

export interface SitemapEntry {
  url: string;
  lastModified?: string;
}

/** One stored chunk, as much of it as the planning needs. */
export interface ExistingGitbookRow {
  source_id: string;
  chunk_index: number;
  content_hash: string | null;
  last_modified: string | null;
  page_hash: string | null;
}

/** What is already stored for one page. */
export interface IndexedPage {
  /** chunk_index → content_hash */
  hashes: Map<number, string>;
  /** Every sitemap date any of the page's chunks was written with. */
  lastModified: Set<string>;
  /** Every fingerprint any of the page's chunks was written with. */
  pageHashes: Set<string>;
}

/** source_id of a GitBook page: its URL path, which is unique across spaces. */
export function gitbookSourceId(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, "").replace(/\/$/, "") || "index";
  } catch {
    return url;
  }
}

export function indexExistingPages(rows: Iterable<ExistingGitbookRow>): Map<string, IndexedPage> {
  const pages = new Map<string, IndexedPage>();
  for (const row of rows) {
    let page = pages.get(row.source_id);
    if (!page) {
      page = { hashes: new Map(), lastModified: new Set(), pageHashes: new Set() };
      pages.set(row.source_id, page);
    }
    if (row.content_hash) page.hashes.set(row.chunk_index, row.content_hash);
    if (row.last_modified) page.lastModified.add(row.last_modified);
    if (row.page_hash) page.pageHashes.add(row.page_hash);
  }
  return pages;
}

/**
 * Which sitemap entries need fetching.
 *
 * A page is current when ANY of its chunks carries the sitemap's date. The
 * old test took the first row it saw — and a re-crawl only rewrites chunks
 * whose content changed, so after one edit a page holds the new date on some
 * chunks and the original date on the rest. Whichever row came back first
 * decided, typically chunk 0, which an edit further down the page leaves
 * alone: the page then read as stale on every later run, and was fetched
 * and re-described by Vision every week for good.
 *
 * Entries without `<lastmod>` are always fetched (the fingerprint then
 * decides whether they cost anything more), and so is everything under
 * `force`. A URL listed twice is fetched once.
 */
export function selectPagesToFetch(
  entries: SitemapEntry[],
  pages: Map<string, IndexedPage>,
  force: boolean,
): { toFetch: SitemapEntry[]; unchanged: number } {
  const toFetch: SitemapEntry[] = [];
  const seen = new Set<string>();
  let unchanged = 0;
  for (const entry of entries) {
    const id = gitbookSourceId(entry.url);
    if (seen.has(id)) continue;
    seen.add(id);
    if (!force && entry.lastModified && pages.get(id)?.lastModified.has(entry.lastModified)) {
      unchanged++;
      continue;
    }
    toFetch.push(entry);
  }
  return { toFetch, unchanged };
}

/** What a check found waiting in one space. */
export interface PendingCounts {
  /** Distinct pages in the sitemap. */
  total: number;
  /** Indexed pages whose sitemap date is not one the index holds. */
  changed: number;
  /** Sitemap pages with no chunk at all — added since the last crawl. */
  added: number;
  /** Sitemap pages with no `<lastmod>`: only fetching one can tell. */
  undated: number;
  /** Pages the crawl would skip. */
  unchanged: number;
}

/**
 * How much work a space is holding, without fetching a single page.
 *
 * This is what the weekly job reports and what the Sync button's badge shows
 * (see gitbook-check.ts). It is deliberately built ON TOP of
 * `selectPagesToFetch` rather than beside it: two implementations of "is this
 * page current?" would drift the first time one of them was fixed, and this
 * file exists because those rules already broke silently once. The three
 * buckets partition exactly what a crawl would fetch.
 */
export function classifyPending(
  entries: SitemapEntry[],
  pages: Map<string, IndexedPage>,
): PendingCounts {
  const { toFetch, unchanged } = selectPagesToFetch(entries, pages, false);
  let changed = 0;
  let added = 0;
  let undated = 0;
  for (const entry of toFetch) {
    if (!pages.has(gitbookSourceId(entry.url))) added++;
    else if (!entry.lastModified) undated++;
    else changed++;
  }
  return { total: toFetch.length + unchanged, changed, added, undated, unchanged };
}

/**
 * Pages that are KNOWN to be new or changed — the number shown to a person.
 *
 * `undated` is left out, although a crawl does fetch those pages. A sitemap
 * entry with no `<lastmod>` cannot be judged without fetching it (the page
 * fingerprint decides, and almost always decides to write nothing), so it
 * never leaves that bucket: counting it would give four of the real spaces a
 * badge that stays lit after a sync, and a number that cannot be cleared is a
 * number nobody acts on. The count is still reported separately, and the
 * partition is what keeps it honest: changed + added + undated is exactly
 * what the crawl fetches.
 */
export function pendingPageCount(p: PendingCounts): number {
  return p.changed + p.added;
}

/**
 * GitBook's relative "Last updated 26 days ago", on its own line.
 *
 * It is not content, it is wrong the day after it is indexed, and it changes
 * every day on its own — so a page that has not been touched would look
 * edited to anything comparing its text.
 */
const RELATIVE_UPDATED_LINE =
  /^[ \t]*(?:Last updated (?:(?:about |over |almost )?(?:\d+|an?) (?:second|minute|hour|day|week|month|year)s? ago|yesterday|today|just now|last (?:week|month|year))|最終更新\s*(?:\d+\s*(?:秒|分|時間|日|週間|か月|ヶ月|年)前|昨日|今日|先週|先月|昨年))[ \t]*$/gim;

export function stripRelativeUpdated(text: string): string {
  return text.replace(RELATIVE_UPDATED_LINE, "").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Identity of a fetched page before any model has looked at it: its text,
 * which images it shows, and which section each image sits in.
 *
 * Stored on the chunks it produced. A page whose fingerprint is already
 * stored is skipped before Vision — that is what keeps the pages GitBook
 * lists without `<lastmod>` (29 of the 31 in the EDCC manual) from being
 * described again every week.
 */
export function pageFingerprint(page: {
  content: string;
  imageUrls: string[];
  sectionImages: Map<string, string[]>;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        stripRelativeUpdated(page.content),
        page.imageUrls,
        [...page.sectionImages].filter(([, urls]) => urls.length > 0),
      ]),
    )
    .digest("hex");
}

/**
 * Where a page's images stand after this run's Vision calls.
 *
 *   complete — every image has a description, or failed in a way that will
 *              fail again (the image is gone, Gemini refused the file). The
 *              page is written and fingerprinted, so it is not retried weekly.
 *   retry    — a call failed in a way worth another try: a timeout, a 429, a
 *              5xx, a missing key. Nothing of the page is written. Writing it
 *              would overwrite a stored description with nothing and record
 *              the page's date, so it would not be looked at again until
 *              somebody edits it — an LED table lost to one rate limit.
 *   deferred — Vision stopped at the deadline before this page's images.
 *              Nothing is written; the next run picks it up.
 *
 * `descriptions` holds text, or null for a lasting failure; `retry` holds the
 * images whose failures were temporary. An image in neither was not reached.
 */
export type VisionState = "complete" | "retry" | "deferred";

export function visionState(
  imageUrls: string[],
  descriptions: Map<string, string | null>,
  retry: Set<string>,
): VisionState {
  let state: VisionState = "complete";
  for (const url of imageUrls) {
    if (retry.has(url)) return "retry";
    if (!descriptions.has(url)) state = "deferred";
  }
  return state;
}

/** One step of writing a page. */
export type WriteStep =
  | { kind: "upsert"; chunkIndex: number; withMarkers: boolean }
  | { kind: "trim"; chunkIndices: number[] }
  | { kind: "markers"; rewrite: boolean };

/**
 * The order a page is written in; the caller stops at the first step that
 * fails.
 *
 * The markers — sitemap date and fingerprint — are what tell a later run the
 * page is done, so they ride on the LAST step, after the stale-chunk trim.
 * If anything before that fails, no chunk carries them and the next run does
 * the page again instead of trusting a half-written one. When no chunk
 * changed, the last step records the markers on their own; after a trim it
 * rewrites them, because the row that carried them may be the one trimmed.
 */
export function planPageWrites(changed: number[], stale: number[]): WriteStep[] {
  const steps = changed
    .slice(0, -1)
    .map((chunkIndex): WriteStep => ({ kind: "upsert", chunkIndex, withMarkers: false }));
  if (stale.length > 0) steps.push({ kind: "trim", chunkIndices: stale });
  const last = changed.at(-1);
  steps.push(
    last === undefined
      ? { kind: "markers", rewrite: stale.length > 0 }
      : { kind: "upsert", chunkIndex: last, withMarkers: true },
  );
  return steps;
}

/** Stored chunk indices this page no longer produces — heading or focused. */
export function staleChunkIndices(page: IndexedPage | undefined, produced: Set<number>): number[] {
  if (!page) return [];
  return [...page.hashes.keys()].filter((i) => !produced.has(i)).sort((a, b) => a - b);
}

/**
 * The page-level markers no stored chunk carries yet, or null if none.
 *
 * A page with nothing to rewrite still needs its new date (and fingerprint)
 * stored somewhere, or it is fetched again next week for nothing — which is
 * what happens to a page whose `<lastmod>` moves without its text changing.
 */
export function missingMarkers(
  page: IndexedPage | undefined,
  want: { lastModified?: string; pageHash?: string },
): { lastModified?: string; pageHash?: string } | null {
  const missing: { lastModified?: string; pageHash?: string } = {};
  if (want.lastModified && !page?.lastModified.has(want.lastModified)) {
    missing.lastModified = want.lastModified;
  }
  if (want.pageHash && !page?.pageHashes.has(want.pageHash)) {
    missing.pageHash = want.pageHash;
  }
  return missing.lastModified || missing.pageHash ? missing : null;
}
