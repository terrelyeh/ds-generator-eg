/**
 * The GitBook UPDATE CHECK — and why the weekly job no longer re-crawls.
 *
 * GitBook used to be re-crawled by `/api/cron/reindex-web`, last in the run,
 * on whatever time was left over. Four spaces never fit: the first run that
 * ever finished (2026-09-18) got through two of them in 206s and left 22
 * pages, which is the steady state under a 300s cap, not a bad week. A crawl
 * that is always half-done is a crawl nobody can reason about, so it moved to
 * the Knowledge page's per-space Sync button — where a person asks for it,
 * waits for it, and reads what it did.
 *
 * What stayed automatic is the QUESTION that button needs answered: which
 * space has anything new? That is the first half of the crawl and nothing
 * else — each space's sitemap, against the dates already stored on its
 * chunks. It fetches no page, calls no Vision, embeds nothing and writes no
 * document: a few seconds for every space, against minutes for one.
 *
 * Without it, nothing would notice stale GitBook content. The button on its
 * own is only as good as somebody remembering to press it, and four spaces of
 * product documentation are among the most-cited sources Ask has.
 */
import { createAdminClient } from "@eg/db/admin";
import { getSetting, setSetting } from "@eg/db/settings";
import { selectAll } from "./select-all";
import { fetchGitbookSitemap } from "./gitbook-fetcher";
import {
  classifyPending,
  indexExistingPages,
  pendingPageCount,
  type ExistingGitbookRow,
  type IndexedPage,
  type PendingCounts,
} from "./gitbook-plan";

type Supabase = ReturnType<typeof createAdminClient>;

/** One space's answer: how much a Sync would go and fetch right now. */
export interface SpacePending extends PendingCounts {
  spaceUrl: string;
  spaceLabel: string;
  /** When THIS space was last looked at — a sync re-checks only its own. */
  checkedAt: string;
  /** Why this space could not be checked (sitemap down, unreadable index). */
  error?: string;
}

/** The whole check, as the Knowledge page reads it back. */
export interface GitbookCheck {
  /**
   * When the last check of EVERY space ran. A single-space re-check after a
   * sync leaves this alone and stamps that space instead, so this stays the
   * answer to "when was the whole thing last looked at".
   */
  checked_at: string;
  spaces: SpacePending[];
}

/** app_settings key. Plain state, not a credential — see @eg/db/settings. */
export const GITBOOK_CHECK_SETTING = "gitbook_update_check";

/**
 * Every chunk already stored under this space's path — paged, because the
 * old unpaged read of all gitbook rows stopped at 1000 (see select-all).
 *
 * Scoped by source_id prefix rather than `metadata->>space_url`: a source_id
 * is the page's URL path, so the prefix reaches every row a page of this
 * space can own, whatever its metadata says. It also picks up a nested
 * space's rows (…/manual/jp under …/manual); no page of this space maps to
 * those ids, so they only cost the read.
 *
 * That extra reach is why neither the check nor the crawl reports pages that
 * have DISAPPEARED from a space: the rows read here are a superset of the
 * space, fine for "is this page indexed?" and wrong for "what is left over".
 */
export async function loadExistingChunks(
  supabase: Supabase,
  baseUrl: string,
): Promise<ExistingGitbookRow[]> {
  let prefix = "";
  try {
    prefix = new URL(baseUrl).pathname.replace(/^\/+|\/+$/g, "");
  } catch {
    // An unparsable space URL fetched no sitemap either; read the whole type.
  }
  return selectAll<ExistingGitbookRow>((from, to) => {
    let query = supabase
      .from("documents" as "products")
      .select(
        "source_id, chunk_index, content_hash, last_modified:metadata->>last_modified, page_hash:metadata->>page_hash",
      )
      .eq("source_type", "gitbook");
    if (prefix) query = query.like("source_id", `${prefix}%`);
    return query.order("id").range(from, to) as unknown as PromiseLike<{
      data: ExistingGitbookRow[] | null;
      error: unknown;
    }>;
  }, "gitbook existing chunks");
}

/** The indexed spaces, from chunk 0 of every stored page. */
export async function listGitbookSpaces(
  supabase: Supabase,
): Promise<{ spaceUrl: string; spaceLabel: string }[]> {
  const rows = await selectAll<{ space_url: string | null; space_label: string | null }>(
    (from, to) =>
      supabase
        .from("documents" as "products")
        .select("space_url:metadata->>space_url, space_label:metadata->>space_label")
        .eq("source_type", "gitbook")
        .eq("chunk_index", 0)
        .order("id")
        .range(from, to) as unknown as PromiseLike<{
        data: { space_url: string | null; space_label: string | null }[] | null;
        error: unknown;
      }>,
    "gitbook spaces",
  );
  const spaces = new Map<string, string>();
  for (const r of rows) {
    if (!r.space_url || spaces.has(r.space_url)) continue;
    spaces.set(r.space_url, r.space_label || r.space_url);
  }
  return [...spaces].map(([spaceUrl, spaceLabel]) => ({ spaceUrl, spaceLabel }));
}

/**
 * One space's sitemap against the index.
 *
 * Never throws: a space whose sitemap is down must not stop the other three
 * from being checked, and the run has to be able to report which one it was.
 */
export async function checkGitbookSpace(spaceUrl: string, spaceLabel: string): Promise<SpacePending> {
  const empty: PendingCounts = { total: 0, changed: 0, added: 0, undated: 0, unchanged: 0 };
  const checkedAt = new Date().toISOString();
  try {
    const entries = await fetchGitbookSitemap(spaceUrl);
    let existing: Map<string, IndexedPage>;
    try {
      existing = indexExistingPages(await loadExistingChunks(createAdminClient(), spaceUrl.replace(/\/$/, "")));
    } catch (err) {
      // Carrying on with an empty index would call every page new and put a
      // whole-space number on the button.
      throw new Error(`index read failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { spaceUrl, spaceLabel, checkedAt, ...classifyPending(entries, existing) };
  } catch (err) {
    return { spaceUrl, spaceLabel, checkedAt, ...empty, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Check every indexed space and store the answer.
 *
 * Stored rather than recomputed on page load: the Knowledge page should open
 * with the numbers already on it, and a check costs a sitemap fetch per space
 * — small, but not small enough to pay on every visit. The 「檢查更新」button
 * re-runs this when someone wants it fresher than the weekly run.
 */
export async function runGitbookCheck(
  spaces?: { spaceUrl: string; spaceLabel: string }[],
): Promise<GitbookCheck> {
  const supabase = createAdminClient();
  const list = spaces ?? (await listGitbookSpaces(supabase));
  // In parallel: the whole point is that this is cheap, and four sitemaps in
  // sequence would cost four round trips for no reason.
  const checked = await Promise.all(list.map((s) => checkGitbookSpace(s.spaceUrl, s.spaceLabel)));
  const check: GitbookCheck = { checked_at: new Date().toISOString(), spaces: checked };
  await setSetting(GITBOOK_CHECK_SETTING, JSON.stringify(check));
  return check;
}

/**
 * Re-check ONE space and merge it into the stored answer.
 *
 * Runs right after a manual crawl, so the badge stops showing the count that
 * crawl just cleared. Only that space: the crawl can have spent most of the
 * request's 300s, and three more sitemap fetches are exactly the kind of
 * thing that turns a finished sync into a lost response.
 */
export async function recheckSpace(spaceUrl: string, spaceLabel: string): Promise<GitbookCheck> {
  const fresh = await checkGitbookSpace(spaceUrl, spaceLabel);
  const stored = await readGitbookCheck();
  const check: GitbookCheck = {
    checked_at: stored?.checked_at ?? fresh.checkedAt,
    spaces: [...(stored?.spaces ?? []).filter((s) => s.spaceUrl !== fresh.spaceUrl), fresh],
  };
  await setSetting(GITBOOK_CHECK_SETTING, JSON.stringify(check));
  return check;
}

/** The stored check, or null when nothing has run (or the row is unreadable). */
export async function readGitbookCheck(): Promise<GitbookCheck | null> {
  const raw = await getSetting(GITBOOK_CHECK_SETTING);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GitbookCheck;
    if (!parsed?.checked_at || !Array.isArray(parsed.spaces)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Pages waiting for a manual sync across every space. */
export function totalPending(spaces: SpacePending[]): number {
  return spaces.reduce((sum, s) => sum + pendingPageCount(s), 0);
}

/** One line for the heartbeat and the run log. */
export function describeCheck(spaces: SpacePending[]): string {
  const withWork = spaces
    .filter((s) => !s.error && pendingPageCount(s) > 0)
    .map((s) => `${s.spaceLabel} ${pendingPageCount(s)}`);
  const failed = spaces.filter((s) => s.error).length;
  const parts = [`${spaces.length} space(s) checked`];
  parts.push(withWork.length > 0 ? `changed: ${withWork.join(", ")}` : "all current");
  if (failed > 0) parts.push(`${failed} could not be checked`);
  return parts.join(", ");
}
