import { describe, expect, it } from "vitest";
import type { SiteVerdict } from "./compare";
import {
  buildMarketingDigest,
  buildPushDigest,
  describeSites,
  languageVerdict,
  nextPushState,
  siteLanguage,
  sitesByLanguage,
  stageOf,
  trackVersion,
  unmarkedLatest,
  type Mark,
  type TrackedVersion,
} from "./reminders";

const verdict = (overrides: Partial<SiteVerdict>): SiteVerdict => ({
  site: "EU",
  status: "ok",
  summary: "",
  rows: [],
  missing: [],
  issues: [],
  ...overrides,
});

const mark = (overrides: Partial<Mark> = {}): Mark => ({
  locale: "en",
  decision: "ready",
  version: "1.3",
  generatedAt: "2026-08-06T02:00:00.000Z",
  markedAt: "2026-08-07T03:00:00.000Z",
  markedBy: null,
  ...overrides,
});

describe("which sites a language version goes to", () => {
  it("sends English to EU, APAC and IN, and to TW only when there is no Chinese version", () => {
    const withChinese = sitesByLanguage(new Set(["en", "ja", "zh"]));
    expect(withChinese.groups).toEqual([
      { language: "en", sites: ["EU", "APAC", "IN"] },
      { language: "ja", sites: ["JP"] },
      { language: "zh", sites: ["TW"] },
    ]);
    expect(withChinese.others).toEqual([]);

    const englishOnly = sitesByLanguage(new Set(["en"]));
    expect(englishOnly.groups).toEqual([{ language: "en", sites: ["EU", "TW", "APAC", "IN"] }]);
    expect(englishOnly.others).toEqual(["JP"]);
  });

  it("puts every site under at most one language", () => {
    const { groups, others } = sitesByLanguage(new Set(["en", "zh"]));
    const all = [...groups.flatMap((g) => g.sites), ...others];
    expect(all.sort()).toEqual(["APAC", "EU", "IN", "JP", "TW"]);
    expect(siteLanguage("TW", new Set(["en", "zh"]))).toBe("zh");
  });
});

describe("one language's verdict on a site", () => {
  it("reads the language map when the check has one, even if another language decided the site's status", () => {
    const v = verdict({ status: "todo", languages: { zh: { status: "todo", why: "沒有繁中" }, en: { status: "ok", why: "相同" } } });
    expect(languageVerdict(v, "en")).toEqual({ status: "ok", why: "相同" });
  });

  it("falls back to missing and rows for checks saved before the map existed", () => {
    const old = verdict({
      status: "todo",
      missing: [{ language: "zh", status: "todo", why: "站上沒有" }],
      rows: [{ fileId: 1, title: "", filename: "DS_ECW536_v1.3.pdf", language: "en", scope: "single", otherModels: [], production: null, staging: null, status: "push", why: "等推送" }],
    });
    expect(languageVerdict(old, "zh")?.status).toBe("todo");
    expect(languageVerdict(old, "en")?.status).toBe("push");
    expect(languageVerdict(old, "ja")).toBeNull();
  });

  it("carries a failed or page-less site through as that", () => {
    expect(languageVerdict(verdict({ status: "nopage", summary: "沒有產品頁" }), "en")?.status).toBe("nopage");
  });
});

describe("stages", () => {
  it("routes each status to whoever acts next", () => {
    expect(stageOf("ok")).toBe("live");
    expect(stageOf("push")).toBe("push");
    expect(stageOf("todo")).toBe("upload");
    expect(stageOf("diff")).toBe("fix");
    expect(stageOf("prodnewer")).toBe("fix");
    expect(stageOf("nopage")).toBe("nopage");
    expect(stageOf("fail")).toBe("unknown");
    expect(stageOf(null)).toBe("unknown");
  });
});

describe("tracking a marked version", () => {
  const checks = {
    EU: { verdict: verdict({ languages: { en: { status: "ok", why: "相同" } } }), checkedAt: "2026-09-16T01:30:00.000Z" },
    APAC: { verdict: verdict({ site: "APAC", status: "push", languages: { en: { status: "push", why: "等推送" } } }), checkedAt: "2026-09-16T01:30:00.000Z" },
  } as const;

  it("lists only the sites that take the language, with unchecked sites as unknown", () => {
    const tracked = trackVersion({ model: "ECW536", mark: mark(), currentGeneratedAt: "2026-08-06T02:00:00.000Z", available: new Set(["en", "ja", "zh"]), checks });
    expect(tracked.sites.map((s) => [s.site, s.stage])).toEqual([
      ["EU", "live"],
      ["APAC", "push"],
      ["IN", "unknown"],
    ]);
    expect(tracked.regenerated).toBe(false);
  });

  it("notices a Regenerate after the mark", () => {
    const tracked = trackVersion({ model: "ECW536", mark: mark(), currentGeneratedAt: "2026-09-15T08:00:00.000Z", available: new Set(["en"]), checks });
    expect(tracked.regenerated).toBe(true);
  });
});

describe("latest versions nobody decided on", () => {
  const now = new Date("2026-09-16T01:30:00.000Z");
  const products: { id: string; model_name: string; status: string | null; current_versions: Record<string, string> | null }[] = [
    { id: "p1", model_name: "ECW220", status: "active", current_versions: { en: "1.1", ja: "1.2" } },
    { id: "p2", model_name: "ECW999", status: "upcoming", current_versions: { en: "1.0" } },
    { id: "p3", model_name: "ECW536", status: "active", current_versions: { en: "1.4" } },
  ];
  const versions = [
    { product_id: "p1", locale: "en", version: "1.1", generated_at: "2026-04-09T00:00:00.000Z" },
    { product_id: "p1", locale: "ja", version: "1.2", generated_at: "2026-09-14T00:00:00.000Z" },
    { product_id: "p2", locale: "en", version: "1.0", generated_at: "2026-01-01T00:00:00.000Z" },
    { product_id: "p3", locale: "en", version: "1.4", generated_at: "2026-08-01T00:00:00.000Z" },
    { product_id: "p3", locale: "en", version: "1.3", generated_at: "2026-06-01T00:00:00.000Z" },
  ];

  it("counts active products' latest versions older than a week without a mark for that version", () => {
    const list = unmarkedLatest(products, versions, [], now);
    expect(list.map((v) => `${v.model} ${v.locale} ${v.version}`)).toEqual(["ECW220 en 1.1", "ECW536 en 1.4"]);
  });

  it("drops a version once it is marked either way, but a mark on an older version doesn't cover the newer one", () => {
    const marks = [
      { product_id: "p1", locale: "en", version: "1.1" },
      { product_id: "p3", locale: "en", version: "1.3" },
    ];
    expect(unmarkedLatest(products, versions, marks, now).map((v) => v.model)).toEqual(["ECW536"]);
  });

  it("ignores version numbers detected from Drive, which have no PDF in SpecHub", () => {
    const driveOnly = [{ id: "p4", model_name: "ECW115", status: "active", current_versions: { en: "2.0" } }];
    expect(unmarkedLatest(driveOnly, versions, [], now)).toEqual([]);
  });
});

describe("push detection", () => {
  it("starts from production's newest content as a lower bound", () => {
    expect(nextPushState(null, { productionModified: "2026-09-11T06:18:49Z", checkedAt: "2026-09-16T01:30:00Z" })).toEqual({
      lastPushAt: "2026-09-11T06:18:49Z",
      pushDetected: false,
    });
  });

  it("calls it a push when production's newest content moves, dated no earlier than the previous check", () => {
    const previous = { checked_at: "2026-09-15T01:30:00Z", production_modified: "2026-09-11T06:18:49Z", last_push_at: "2026-09-11T06:18:49Z", push_detected: false };
    expect(nextPushState(previous, { productionModified: "2026-09-15T03:34:40Z", checkedAt: "2026-09-16T01:30:00Z" })).toEqual({
      lastPushAt: "2026-09-15T03:34:40Z",
      pushDetected: true,
    });
    expect(nextPushState(previous, { productionModified: "2026-09-12T00:00:00Z", checkedAt: "2026-09-16T01:30:00Z" }).lastPushAt).toBe("2026-09-15T01:30:00Z");
  });

  it("keeps the previous push when production hasn't moved", () => {
    const previous = { checked_at: "2026-09-15T01:30:00Z", production_modified: "2026-09-15T03:34:40Z", last_push_at: "2026-09-15T03:34:40Z", push_detected: true };
    expect(nextPushState(previous, { productionModified: "2026-09-15T03:34:40Z", checkedAt: "2026-09-16T01:30:00Z" })).toEqual({
      lastPushAt: "2026-09-15T03:34:40Z",
      pushDetected: true,
    });
  });
});

describe("the pusher's digest", () => {
  const now = new Date("2026-09-15T01:30:00.000Z");

  it("sends nothing when no site has anything to push and nothing blocks", () => {
    expect(buildPushDigest({ now, blockers: [], pending: {}, lastPush: {} })).toBeNull();
  });

  it("lists blocked sites first, then each site's pending datasheets with days waiting, then the quiet ones", () => {
    const text = buildPushDigest({
      now,
      blockers: [{ site: "IN", model: "ECW270", why: "正式站是英文 v1.2，測試站還是 v1.1" }],
      pending: { APAC: [{ label: "ECW536", language: "en", version: "v1.3", modifiedAt: "2026-09-12T03:00:00.000Z" }] },
      lastPush: { APAC: { at: "2026-08-29T03:00:00.000Z", detected: true } },
    })!;
    expect(text.indexOf("推 IN 之前先等一下")).toBeLessThan(text.indexOf("可以推送"));
    expect(text).toContain("<b>APAC</b>（上次推送約 8/29）\n・ECW536 英文 v1.3，等了 2 天");
    expect(text).toContain("EU、JP、TW 沒有待推送。");
  });

  it("says a push date is only a lower bound until one has been seen", () => {
    const text = buildPushDigest({
      now,
      blockers: [],
      pending: { APAC: [{ label: "EWS377-FIT", language: "en", version: "v1.2", modifiedAt: "2026-09-03T00:00:00.000Z" }] },
      lastPush: { APAC: { at: "2026-09-11T06:18:49.000Z", detected: false } },
    })!;
    expect(text).toContain("（上次推送 9/11 之後）");
  });
});

describe("marketing's digest", () => {
  const now = new Date("2026-09-15T01:30:00.000Z");
  const entry = (overrides: Partial<TrackedVersion>): TrackedVersion => ({
    model: "ECW230",
    language: "en",
    version: "1.2",
    markedAt: "2026-09-02T03:00:00.000Z",
    regenerated: false,
    sites: [],
    ...overrides,
  });

  it("sends nothing when every tracked site is live and nothing is unmarked", () => {
    const tracked = [entry({ sites: [{ site: "EU", stage: "live", status: "ok", why: "", checkedAt: null }] })];
    expect(buildMarketingDigest({ now, tracked, unmarkedCount: 0, link: null })).toBeNull();
  });

  it("groups by what to do, then by site, and ends with the unmarked count and the link", () => {
    const tracked = [
      entry({
        sites: [
          { site: "EU", stage: "upload", status: "todo", why: "", checkedAt: null },
          { site: "IN", stage: "upload", status: "todo", why: "", checkedAt: null },
          { site: "APAC", stage: "push", status: "push", why: "", checkedAt: null },
        ],
      }),
      entry({ model: "ECW270", sites: [{ site: "IN", stage: "fix", status: "prodnewer", why: "", checkedAt: null }] }),
      entry({ model: "ECW536", version: "1.3", regenerated: true, sites: [{ site: "IN", stage: "fix", status: "diff", why: "站上 1.29 MB、SpecHub 1.14 MB", checkedAt: null }] }),
    ];
    const text = buildMarketingDigest({ now, tracked, unmarkedCount: 77, link: "https://example.test/website?tab=tracking" })!;
    expect(text.indexOf("先補傳到測試站")).toBeLessThan(text.indexOf("還沒上測試站"));
    expect(text).toContain("<b>IN</b>・ECW270 英文 v1.2 只在正式站，下次推送會被蓋掉");
    expect(text).toContain("<b>EU</b>・ECW230 英文 v1.2，標記後 12 天");
    expect(text).toContain("ECW536 英文 v1.3（標記後重產過）：站上 1.29 MB、SpecHub 1.14 MB");
    expect(text).not.toContain("APAC");
    expect(text).toContain("另有 77 份最新版產出超過 7 天");
    expect(text.trimEnd().endsWith("在 SpecHub 打開上架追蹤 ›</a>")).toBe(true);
  });

  it("escapes text that came from the sites", () => {
    const tracked = [entry({ sites: [{ site: "EU", stage: "fix", status: "mismatch", why: "<b>x</b> & y", checkedAt: null }] })];
    expect(buildMarketingDigest({ now, tracked, unmarkedCount: 0, link: null })).toContain("&lt;b&gt;x&lt;/b&gt; &amp; y");
  });
});

describe("a version's sites in one line", () => {
  const site = (s: "EU" | "APAC" | "IN" | "TW", stage: "live" | "upload" | "nopage") => ({ site: s, stage, status: null, why: "", checkedAt: null });

  it("says a version is live everywhere only when every site has it", () => {
    expect(describeSites([site("EU", "live"), site("APAC", "live"), site("IN", "live")])).toEqual({ text: "EU、APAC、IN 已經是這一版", allLive: true });
    expect(describeSites([site("EU", "live"), site("IN", "upload")])).toEqual({ text: "EU 已經是這一版；IN 還沒有", allLive: false });
  });

  it("doesn't count a site with no product page as live", () => {
    expect(describeSites([site("TW", "nopage")]).allLive).toBe(false);
  });
});
