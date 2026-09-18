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
 * Run order. The kinds that cannot stop part-way through a unit go first,
 * while the budget is whole. GitBook goes last: it writes as it goes and
 * picks up next week wherever it stopped, so it is the one that can absorb
 * whatever time is left.
 */
export const SOURCE_KINDS: readonly SourceKind[] = ["helpcenter", "google_doc", "web", "gitbook"];

/**
 * The time budget, counted from the start of the request (maxDuration 300s).
 *
 * START_CUTOFF_MS — no unit of that kind starts after this. The kinds that
 * cannot stop part-way stop starting first, so GitBook always has some room
 * and a slow run of docs cannot take every week's budget.
 *
 * WORK_BUDGET_MS — the deadline handed to GitBook, which stops between page
 * batches when it passes.
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
  helpcenter: 150_000,
  google_doc: 150_000,
  web: 150_000,
  gitbook: 200_000,
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
  /** GitBook pages a space left for the next run when the deadline passed. */
  deferredPages: number;
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
 * Not ok when anything errored or threw — and not ok when work was left for
 * next time. A run cut short by its budget did finish, which is why it
 * writes a heartbeat at all, but it did not refresh every source; saying ok
 * would hide exactly the slow creep that let this job time out unnoticed.
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

  const errors = outcomes.flatMap((o) => o.errors.map((e) => `${o.kind}: ${e}`));
  if (errors.length > 0) {
    parts.push(`${errors.length} error(s), first — ${errors[0].slice(0, ERROR_EXCERPT)}`);
  }

  const failed = outcomes.some((o) => o.status === "failed");
  return {
    ok:
      !fatal &&
      !failed &&
      interrupted.length === 0 &&
      errors.length === 0 &&
      deferredUnits === 0 &&
      deferredPages === 0,
    detail: parts.join(" · "),
  };
}
