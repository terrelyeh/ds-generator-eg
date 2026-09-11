import { describe, expect, it } from "vitest";
import { parsePeriod, periodRange, taipeiDayKey } from "./period";
import { entryLabel, workspaceStatus } from "./status";
import { change, fmtTokens, fmtUsd, relativeTime, shortDate } from "./format";

const NOW = new Date("2026-09-12T03:00:00Z"); // 11:00 in Taiwan

describe("period", () => {
  it("files a late-evening UTC time under the next Taiwan day", () => {
    expect(taipeiDayKey(new Date("2026-09-11T17:30:00Z"))).toBe("2026-09-12");
  });

  it("covers today and the days before it, in whole Taiwan days", () => {
    const r = periodRange(7, NOW);
    expect(r.dayKeys).toEqual(["2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"]);
    expect(r.from).toBe("2026-09-05T16:00:00.000Z");
    expect(r.prevFrom).toBe("2026-08-29T16:00:00.000Z");
    expect(r.prevTo).toBe(r.from);
  });

  it("accepts 7 / 30 / 90 and falls back to 30", () => {
    expect([parsePeriod("7"), parsePeriod(90), parsePeriod("365"), parsePeriod(undefined)]).toEqual([7, 90, 30, 30]);
  });
});

describe("workspaceStatus", () => {
  const base = { enabled: true, everUsed: true, questions: 20, noMatch: 1, errors: 0, lastAt: "2026-09-12T01:00:00Z" };

  it("says 正常 when nothing needs attention", () => {
    expect(workspaceStatus(base, NOW)).toEqual([{ tone: "good", label: "正常" }]);
  });

  it("puts errors before a high no-match rate", () => {
    expect(workspaceStatus({ ...base, errors: 2, noMatch: 6 }, NOW).map((s) => s.label)).toEqual(["2 次錯誤", "答不出來偏多"]);
  });

  it("ignores the no-match rate on too few questions", () => {
    expect(workspaceStatus({ ...base, questions: 2, noMatch: 1 }, NOW)).toEqual([{ tone: "good", label: "正常" }]);
  });

  it("tells a long-idle workspace from one that was merely quiet this week", () => {
    expect(workspaceStatus({ ...base, questions: 0, lastAt: "2026-06-09T14:39:00Z" }, NOW)[0].label).toBe("94 天沒人用");
    expect(workspaceStatus({ ...base, questions: 0, lastAt: "2026-09-08T14:39:00Z" }, NOW)[0].label).toBe("這段期間沒有提問");
  });

  it("doesn't call a workspace idle when its only record is spend from before logging began", () => {
    expect(workspaceStatus({ ...base, questions: 0, spend: 0.28 }, NOW)[0].label).toBe("紀錄開始前有使用");
  });

  it("marks never-used and disabled workspaces", () => {
    expect(workspaceStatus({ ...base, everUsed: false, questions: 0, lastAt: null }, NOW)[0].label).toBe("從未使用");
    expect(workspaceStatus({ ...base, enabled: false }, NOW)[0].label).toBe("已停用");
  });
});

describe("entryLabel", () => {
  it("reads the entry off the allowed origins", () => {
    expect(entryLabel("ext", ["chrome-extension://dakefbpojccpgknegbfbfeicfadbeamk"])).toBe("Chrome extension");
    expect(entryLabel("spechub", ["https://ds-generator-eg.vercel.app"])).toBe("嵌入 ds-generator-eg.vercel.app");
    expect(entryLabel("mkt", [])).toBe("/ask/mkt");
  });
});

describe("format", () => {
  it("says how long ago in words, then falls back to a date", () => {
    expect(relativeTime("2026-09-12T02:59:30Z", NOW)).toBe("剛剛");
    expect(relativeTime("2026-09-12T01:00:00Z", NOW)).toBe("2 小時前");
    expect(relativeTime("2026-09-09T03:00:00Z", NOW)).toBe("3 天前");
    expect(relativeTime("2026-06-09T14:39:00Z", NOW)).toBe("6/9");
    expect(relativeTime(null, NOW)).toBe("—");
  });

  it("formats money and tokens compactly", () => {
    expect([fmtUsd(0), fmtUsd(0.004), fmtUsd(0.2819), fmtUsd(1234.5)]).toEqual(["$0", "<$0.01", "$0.28", "$1,235"]);
    expect([fmtTokens(812), fmtTokens(8400), fmtTokens(99394), fmtTokens(2_450_000)]).toEqual(["812", "8.4K", "99K", "2.5M"]);
  });

  it("reports change against the previous window", () => {
    expect(change(12, 10)).toEqual({ pct: 20, dir: "up" });
    expect(change(5, 10)).toEqual({ pct: 50, dir: "down" });
    expect(change(3, 0)).toEqual({ pct: null, dir: "up" });
    expect(change(0, 0)).toEqual({ pct: null, dir: "flat" });
  });

  it("uses Taiwan dates", () => {
    expect(shortDate("2026-09-11T17:30:00Z")).toBe("9/12");
  });
});
