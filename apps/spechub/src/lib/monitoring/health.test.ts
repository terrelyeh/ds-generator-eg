import { describe, expect, it } from "vitest";
import { evaluateHealth, formatHealthMessage, type HealthInput } from "./health";

const NOW = new Date("2026-09-04T02:00:00Z"); // a Friday
const MONDAY = new Date("2026-09-07T02:00:00Z");
const hoursAgo = (h: number, from = NOW) => new Date(from.getTime() - h * 3_600_000).toISOString();

const healthy = (): HealthInput => ({
  heartbeats: [
    { job: "sync", last_run_at: hoursAgo(1), ok: true, detail: "15 lines" },
    { job: "reindex-products", last_run_at: hoursAgo(1), ok: true, detail: null },
    { job: "reindex-web", last_run_at: hoursAgo(30), ok: true, detail: null },
  ],
  retrievalOk: true,
  retrievalError: null,
  documentCount: 4971,
  previousDocumentCount: 4970,
});

describe("evaluateHealth", () => {
  it("says nothing when everything is fine, and sends nothing", () => {
    const report = evaluateHealth(healthy(), NOW);
    expect(report.alerts).toEqual([]);
    expect(formatHealthMessage(report, NOW)).toBeNull();
  });

  it("catches the retrieval outage that went unnoticed for a day", () => {
    // The exact incident: 00048 pinned search_path to public, pgvector's
    // <=> lives in extensions, every Ask call raised — and the only trace
    // was an absence of usage rows, which is also what a quiet day looks like.
    const report = evaluateHealth(
      {
        ...healthy(),
        retrievalOk: false,
        retrievalError: "operator does not exist: extensions.vector <=> extensions.vector",
      },
      NOW,
    );
    expect(report.alerts).toHaveLength(1);
    expect(report.alerts[0].severity).toBe("critical");
    expect(formatHealthMessage(report, NOW)).toContain("operator does not exist");
  });

  it("catches a sync that stopped running, and says how long", () => {
    // The other incident: 504s for days, then a 405 for another day. A
    // stale heartbeat is the signal a side effect could not give.
    const input = healthy();
    input.heartbeats[0].last_run_at = hoursAgo(80);
    const report = evaluateHealth(input, NOW);
    expect(report.alerts.map((a) => a.severity)).toEqual(["critical"]);
    expect(report.alerts[0].title).toContain("3 天");
  });

  it("separates 'ran and failed' from 'did not run'", () => {
    const input = healthy();
    input.heartbeats[1] = { job: "reindex-products", last_run_at: hoursAgo(1), ok: false, detail: "3 errors" };
    const report = evaluateHealth(input, NOW);
    expect(report.alerts).toHaveLength(1);
    expect(report.alerts[0].severity).toBe("warning");
    expect(report.alerts[0].detail).toBe("3 errors");
  });

  it("reports a job that has never checked in", () => {
    const input = healthy();
    input.heartbeats = input.heartbeats.filter((h) => h.job !== "reindex-web");
    expect(evaluateHealth(input, NOW).alerts[0].title).toContain("從來沒有回報過");
  });

  it("shouts when the corpus shrinks, and stays quiet for ordinary churn", () => {
    // Guards deleteVanishedSources: retrieval keeps answering from whatever
    // survives, so nothing else would notice.
    const big = evaluateHealth({ ...healthy(), documentCount: 900, previousDocumentCount: 4970 }, NOW);
    expect(big.alerts[0].title).toContain("大幅下降");
    const small = evaluateHealth({ ...healthy(), documentCount: 4700, previousDocumentCount: 4970 }, NOW);
    expect(small.alerts).toEqual([]);
    // A first run has nothing to compare against and must not guess.
    const first = evaluateHealth({ ...healthy(), documentCount: 10, previousDocumentCount: null }, NOW);
    expect(first.alerts).toEqual([]);
  });

  it("sends a weekly all-clear so silence is not mistaken for health", () => {
    const friday = evaluateHealth(healthy(), NOW);
    expect(friday.allClear).toBe(false);
    const monday = evaluateHealth(
      {
        ...healthy(),
        heartbeats: healthy().heartbeats.map((h) => ({ ...h, last_run_at: hoursAgo(1, MONDAY) })),
      },
      MONDAY,
    );
    expect(monday.allClear).toBe(true);
    expect(formatHealthMessage(monday, MONDAY)).toContain("一切正常");
  });

  it("does not send an all-clear on a Monday that has alerts", () => {
    const input = { ...healthy(), retrievalOk: false, retrievalError: "boom" };
    const report = evaluateHealth(input, MONDAY);
    expect(report.allClear).toBe(false);
    expect(formatHealthMessage(report, MONDAY)).toContain("🔴");
  });
});
