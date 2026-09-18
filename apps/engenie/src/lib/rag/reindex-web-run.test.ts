import { describe, expect, it } from "vitest";
import {
  chunkList,
  HARD_STOP_MS,
  requestedKinds,
  rotateForWeek,
  START_CUTOFF_MS,
  summarizeRun,
  WORK_BUDGET_MS,
  type UnitOutcome,
} from "./reindex-web-run";

const WEEK = 7 * 24 * 3_600_000;

describe("budget", () => {
  it("stops starting everything before the hard stop, and leaves GitBook the last stretch", () => {
    for (const cutoff of Object.values(START_CUTOFF_MS)) {
      expect(cutoff).toBeLessThanOrEqual(WORK_BUDGET_MS);
    }
    expect(START_CUTOFF_MS.gitbook).toBeGreaterThan(START_CUTOFF_MS.google_doc);
    // Room for the heartbeat and the response before Vercel's 300s.
    expect(HARD_STOP_MS).toBeLessThanOrEqual(285_000);
    expect(HARD_STOP_MS).toBeGreaterThan(WORK_BUDGET_MS);
  });
});

describe("rotateForWeek", () => {
  it("starts from a different unit each week and covers them all", () => {
    const units = ["a", "b", "c"];
    const firsts = [0, 1, 2].map((w) => rotateForWeek(units, w * WEEK + 1)[0]);
    expect(new Set(firsts)).toEqual(new Set(units));
    expect(rotateForWeek(units, 4 * WEEK)).toEqual(["b", "c", "a"]);
  });

  it("keeps every unit, and copes with none", () => {
    expect(rotateForWeek([1, 2, 3, 4], 123 * WEEK).sort()).toEqual([1, 2, 3, 4]);
    expect(rotateForWeek([], Date.now())).toEqual([]);
  });
});

function outcome(extra: Partial<UnitOutcome> & Pick<UnitOutcome, "kind">): UnitOutcome {
  return { target: "t", status: "done", errors: [], ms: 1000, processed: 0, deferredPages: 0, ...extra };
}

describe("requestedKinds", () => {
  it("runs everything, in budget order, when nothing is narrowed", () => {
    expect(requestedKinds(null)).toEqual(["helpcenter", "google_doc", "web", "gitbook"]);
  });

  it("keeps run order and drops names it does not know", () => {
    expect(requestedKinds("gitbook, helpcenter,typo")).toEqual(["helpcenter", "gitbook"]);
    expect(requestedKinds("typo")).toEqual([]);
  });
});

describe("chunkList", () => {
  it("splits into groups of at most n, keeping order", () => {
    expect(chunkList([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkList([], 10)).toEqual([]);
  });
});

describe("summarizeRun", () => {
  it("is ok when every source ran clean", () => {
    const verdict = summarizeRun(
      [
        outcome({ kind: "helpcenter", processed: 3 }),
        outcome({ kind: "gitbook", processed: 12 }),
        outcome({ kind: "gitbook" }),
      ],
      64_400,
    );
    expect(verdict).toEqual({ ok: true, detail: "64s · helpcenter 1/1, gitbook 2/2 · 15 chunk(s) written" });
  });

  it("counts the errors an ingest reports without throwing — the old summary never saw them", () => {
    // The route kept only processed/skipped per source, then looked for an
    // `errors` field on those entries: every run would have said 0 errors.
    const verdict = summarizeRun(
      [
        outcome({ kind: "gitbook", errors: ["Fetch failed: Error: HTTP 404 from https://doc.engenius.ai/x"] }),
        outcome({ kind: "google_doc" }),
      ],
      30_000,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.detail).toContain("1 error(s), first — gitbook: Fetch failed: Error: HTTP 404");
  });

  it("is ok when the budget left work for next week, and says how much", () => {
    const verdict = summarizeRun(
      [
        outcome({ kind: "google_doc" }),
        outcome({ kind: "gitbook", deferredPages: 37 }),
        outcome({ kind: "gitbook", status: "deferred" }),
      ],
      231_000,
    );
    // Declining to start a unit is the plan working, not a failure — the
    // health check would otherwise carry a warning every single week.
    expect(verdict.ok).toBe(true);
    expect(verdict.detail).toBe(
      "231s · google_doc 1/1, gitbook 1/2 · 0 chunk(s) written · left for next run (time budget): 1 source(s) + 37 GitBook page(s)",
    );
  });

  it("names a unit still running at the hard stop, and is not ok", () => {
    const verdict = summarizeRun(
      [
        outcome({ kind: "helpcenter", processed: 2 }),
        outcome({ kind: "google_doc", target: "1AbC", status: "interrupted" }),
        outcome({ kind: "gitbook", status: "deferred" }),
      ],
      280_000,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.detail).toBe(
      "280s · helpcenter 1/1, google_doc 0/1, gitbook 0/1 · 2 chunk(s) written · " +
        "cut off at the 280s hard stop: google_doc 1AbC · left for next run (time budget): 1 source(s)",
    );
  });

  it("separates work declined from work cut off: only the cut-off one is not ok", () => {
    const declined = summarizeRun([outcome({ kind: "gitbook", status: "deferred" })], 210_000);
    const cutOff = summarizeRun([outcome({ kind: "gitbook", status: "interrupted" })], 280_000);
    expect(declined.ok).toBe(true);
    expect(cutOff.ok).toBe(false);
  });

  it("treats a source that threw as not done", () => {
    const verdict = summarizeRun(
      [outcome({ kind: "google_doc", status: "failed", errors: ["Failed to fetch Google Doc abc"] })],
      5_000,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.detail).toContain("google_doc 0/1");
  });

  it("still produces a line when the run stopped before any source", () => {
    const verdict = summarizeRun([], 800, "SUPABASE_SERVICE_ROLE_KEY is not set");
    expect(verdict).toEqual({
      ok: false,
      detail: "1s · stopped: SUPABASE_SERVICE_ROLE_KEY is not set · 0 chunk(s) written",
    });
  });

  it("keeps a long first error short enough for the 500-character heartbeat", () => {
    const verdict = summarizeRun([outcome({ kind: "web", errors: ["x".repeat(2000)] })], 1_000);
    expect(verdict.detail.length).toBeLessThan(300);
  });
});
