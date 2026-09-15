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

/**
 * GitBook's relative "Last updated 26 days ago", on its own line.
 *
 * It is not content, it is wrong the day after it is indexed, and it changes
 * every day on its own — so a page that has not been touched would look
 * edited to anything comparing its text.
 */
const RELATIVE_UPDATED_LINE =
  /^[ \t]*Last updated (?:(?:about |over |almost )?(?:\d+|an?) (?:second|minute|hour|day|week|month|year)s? ago|yesterday|today|just now|last (?:week|month|year))[ \t]*$/gim;

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
 * Did Vision get to every image of a page, and did every description land?
 *
 * `attempted` false means the run stopped describing (its deadline passed)
 * before reaching all of them: the page must not be written, or it would
 * replace stored descriptions with none. `described` false means some calls
 * failed: the page is written, but without a fingerprint, so a later run
 * tries those images again.
 */
export function visionCoverage(
  imageUrls: string[],
  descriptions: Map<string, string | null>,
): { attempted: boolean; described: boolean } {
  let attempted = true;
  let described = true;
  for (const url of imageUrls) {
    if (!descriptions.has(url)) {
      attempted = false;
      described = false;
    } else if (descriptions.get(url) === null) {
      described = false;
    }
  }
  return { attempted, described };
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
