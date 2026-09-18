/**
 * Bookkeeping for the weekly web re-crawl (`/api/cron/reindex-web`), as pure
 * functions: what a request asked for, and what its heartbeat should say.
 *
 * The heartbeat is the only thing that tells SpecHub's health check this job
 * finished. It used to be written after the last source and never reached:
 * both scheduled runs so far (2026-09-06 and 09-13) were killed at 300s. And
 * had it been reached, it would have said "0 error(s)" regardless — it
 * counted an `errors` field the route never copied into its summary.
 */

export type SourceKind = "helpcenter" | "google_doc" | "web" | "gitbook";

/**
 * Run order. GitBook goes FIRST, and it is the only kind that does not
 * re-crawl: its unit is the update check (lib/rag/gitbook-check.ts), a few
 * seconds that say which spaces have new pages for somebody to sync. It runs
 * first because it is cheap and because its answer is the one thing here
 * nobody can recover later — the crawls can be picked up next week, but
 * "what changed" is only true on the day it was asked.
 *
 * It used to run last, on whatever time was left, as a real crawl: four
 * spaces never fit in 300s, so every week ended with some of them half done.
 */
export const SOURCE_KINDS: readonly SourceKind[] = ["gitbook", "helpcenter", "google_doc", "web"];

/**
 * The time budget, counted from the start of the request (maxDuration 300s).
 *
 * START_CUTOFF_MS — no unit of that kind starts after this. Every kind stops
 * starting at the same point now: none of them can stop part-way through a
 * unit, so there is no longer a kind that wants the last stretch to itself.
 *
 * WORK_BUDGET_MS — the deadline handed to a unit that can stop part-way and
 * resume. Only GitBook's crawl ever could, and that crawl now runs from the
 * Knowledge page (which sets its own deadline), so nothing in this run reads
 * it; it stays as the contract a resumable unit would be given.
 *
 * HARD_STOP_MS — the run records its heartbeat and answers at this point no
 * matter what is still running. Starting nothing late is not enough on its
 * own: one unit already running can outlast the budget (a Drive export that
 * hangs, a web page that times out on three engines), and Vercel kills the
 * function at 300s without running anything after — which is how both
 * scheduled runs so far ended, with no heartbeat. Whatever was running is
 * reported as cut off; its writes so far stand, because every pipeline writes
 * first and marks pages done last.
 */
export const START_CUTOFF_MS: Readonly<Record<SourceKind, number>> = {
  gitbook: 150_000,
  helpcenter: 150_000,
  google_doc: 150_000,
  web: 150_000,
};
export const WORK_BUDGET_MS = 200_000;
export const HARD_STOP_MS = 280_000;

/** `?only=gitbook` or `?only=helpcenter,web`; unknown names are ignored. */
export function requestedKinds(only: string | null): SourceKind[] {
  if (!only) return [...SOURCE_KINDS];
  const asked = new Set(only.split(",").map((s) => s.trim()));
  return SOURCE_KINDS.filter((kind) => asked.has(kind));
}

const WEEK_MS = 7 * 24 * 3_600_000;

/**
 * `items` starting from a different position each week.
 *
 * Within a kind the units run in a fixed order, so if a kind's units do not
 * all fit, the same ones at the end would be left over every week, forever.
 * Rotating by the week spreads the leftovers around.
 */
export function rotateForWeek<T>(items: T[], now: number): T[] {
  if (items.length === 0) return [];
  const k = Math.floor(now / WEEK_MS) % items.length;
  return [...items.slice(k), ...items.slice(0, k)];
}

/** `items` in consecutive groups of at most `size`. */
export function chunkList<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += Math.max(1, size)) {
    groups.push(items.slice(i, i + Math.max(1, size)));
  }
  return groups;
}

/** One ingest call's result, as the run records it. */
export interface UnitOutcome {
  kind: SourceKind;
  /** What was refreshed: a space URL, a Drive file id, "20 articles". */
  target: string;
  /**
   * done        — the call returned (it may still have reported errors)
   * failed      — the call threw
   * deferred    — never started: the time budget was spent
   * interrupted — still running at the hard stop
   */
  status: "done" | "failed" | "deferred" | "interrupted";
  errors: string[];
  ms: number;
  /** Chunks written. */
  processed: number;
  /**
   * GitBook pages a space left for the next run when the deadline passed.
   * Only a crawl running inside this job produces these, and the weekly run
   * only checks GitBook now — so this is 0 unless the crawl comes back.
   */
  deferredPages: number;
  /**
   * GitBook pages the update check found waiting for a manual Sync. Not work
   * this job deferred: work it is not the one doing.
   */
  pendingPages: number;
}

export interface RunVerdict {
  ok: boolean;
  /** One line for the heartbeat; the health check shows it as-is. */
  detail: string;
}

const ERROR_EXCERPT = 180;

/**
 * Whether the run did everything it set out to, and a line saying what.
 *
 * Not ok when anything errored or threw, and not ok when a unit was still
 * running at the hard stop — that one is the slow creep this job died of,
 * and it has to keep ringing.
 *
 * A unit the run DECLINED to start, because the budget was spent, is ok. The
 * first real run (2026-09-18) refreshed Help Center and all 17 Google Docs
 * and got through two of four GitBook spaces in 206s with no errors; two
 * sources and 22 pages waited for the next run, which was the steady state
 * with four spaces and a 300s cap, not a fault. (That is also why GitBook is
 * now checked here and crawled by hand.) Reporting that as failure
 * every week would put a permanent warning in the health check, and a
 * warning that is always on is one nobody reads. The count stays in the
 * detail, so the backlog is still visible — and it stops being merely
 * visible the moment a unit is cut off mid-flight.
 */
export function summarizeRun(outcomes: UnitOutcome[], elapsedMs: number, fatal?: string): RunVerdict {
  const parts: string[] = [`${Math.round(elapsedMs / 1000)}s`];
  if (fatal) parts.push(`stopped: ${fatal.slice(0, ERROR_EXCERPT)}`);

  const perKind: string[] = [];
  for (const kind of SOURCE_KINDS) {
    const mine = outcomes.filter((o) => o.kind === kind);
    if (mine.length === 0) continue;
    perKind.push(`${kind} ${mine.filter((o) => o.status === "done").length}/${mine.length}`);
  }
  if (perKind.length > 0) parts.push(perKind.join(", "));
  else if (!fatal) parts.push("no sources");

  const written = outcomes.reduce((sum, o) => sum + o.processed, 0);
  parts.push(`${written} chunk(s) written`);

  const interrupted = outcomes.filter((o) => o.status === "interrupted");
  if (interrupted.length > 0) {
    parts.push(
      `cut off at the ${HARD_STOP_MS / 1000}s hard stop: ${interrupted.map((o) => `${o.kind} ${o.target}`).join(", ")}`,
    );
  }

  const deferredUnits = outcomes.filter((o) => o.status === "deferred").length;
  const deferredPages = outcomes.reduce((sum, o) => sum + o.deferredPages, 0);
  if (deferredUnits > 0 || deferredPages > 0) {
    const left = [
      deferredUnits > 0 ? `${deferredUnits} source(s)` : "",
      deferredPages > 0 ? `${deferredPages} GitBook page(s)` : "",
    ].filter(Boolean);
    parts.push(`left for next run (time budget): ${left.join(" + ")}`);
  }

  // The check's whole output. Still ok: these pages are somebody's queue on
  // the Knowledge page, not something this job failed to do — and a number
  // that is nearly always above zero would make `ok` mean nothing.
  const pending = outcomes.reduce((sum, o) => sum + o.pendingPages, 0);
  if (pending > 0) parts.push(`${pending} GitBook page(s) changed — waiting for a manual sync`);

  const errors = outcomes.flatMap((o) => o.errors.map((e) => `${o.kind}: ${e}`));
  if (errors.length > 0) {
    parts.push(`${errors.length} error(s), first — ${errors[0].slice(0, ERROR_EXCERPT)}`);
  }

  const failed = outcomes.some((o) => o.status === "failed");
  return {
    ok: !fatal && !failed && interrupted.length === 0 && errors.length === 0,
    detail: parts.join(" · "),
  };
}
