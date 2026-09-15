import { describe, expect, it } from "vitest";
import { chunkList, requestedKinds, summarizeRun, type UnitOutcome } from "./reindex-web-run";

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

  it("is not ok when the budget left work for next week, and says how much", () => {
    const verdict = summarizeRun(
      [
        outcome({ kind: "google_doc" }),
        outcome({ kind: "gitbook", deferredPages: 37 }),
        outcome({ kind: "gitbook", status: "deferred" }),
      ],
      231_000,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.detail).toBe(
      "231s · google_doc 1/1, gitbook 1/2 · 0 chunk(s) written · left for next run (time budget): 1 source(s) + 37 GitBook page(s)",
    );
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
