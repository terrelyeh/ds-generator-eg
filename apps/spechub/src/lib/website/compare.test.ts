import { describe, expect, it } from "vitest";
import { judgeLanguage, judgeSite, type FoundDatasheet, type SiteSide, type SpecHubBaseline } from "./compare";

let nextId = 1000;
/** A published single-model English datasheet on the product page, unless overridden. */
function sheet(version: string, overrides: Partial<FoundDatasheet> = {}): FoundDatasheet {
  return {
    fileId: nextId++,
    title: "Cloud7 4x4x4_ECW536 Datasheet",
    filename: `DS_Cloud_ECW536_${version}.pdf`,
    language: "en",
    scope: "single",
    otherModels: [],
    versionField: version,
    fileVersion: version,
    status: "publish",
    onPage: true,
    typeMismatch: false,
    filesize: 1_400_000,
    uploadedAt: "2026-09-01T00:00:00.000Z",
    uploaderId: "12",
    url: null,
    ...overrides,
  };
}
const side = (datasheets: FoundDatasheet[], pageFound = true): SiteSide => ({ error: null, pageFound, datasheets });
/** The same file on both environments, as it is after a push. */
const pushed = (d: FoundDatasheet): [SiteSide, SiteSide] => [side([d]), side([{ ...d }])];
const hub = (version: string, filesize: number | null = 1_400_000) => ({ version, generatedAt: "2026-09-02T00:00:00.000Z", filesize });

describe("judgeLanguage against SpecHub", () => {
  it("is ok when production has SpecHub's version and file", () => {
    expect(judgeLanguage(sheet("v1.4"), sheet("v1.4"), hub("1.4")).status).toBe("ok");
  });

  it("is diff when the version matches but the file size does not", () => {
    const verdict = judgeLanguage(sheet("v1.4", { filesize: 1_310_000 }), sheet("v1.4", { filesize: 1_310_000 }), hub("1.4", 1_480_000));
    expect(verdict.status).toBe("diff");
    expect(verdict.why).toContain("1.25 MB");
  });

  it("is push when staging already carries SpecHub's file under the same version", () => {
    const production = sheet("v1.4", { filesize: 1_310_000, uploadedAt: "2026-08-01T00:00:00.000Z" });
    const staging = sheet("v1.4", { filesize: 1_480_000, uploadedAt: "2026-09-10T00:00:00.000Z" });
    expect(judgeLanguage(production, staging, hub("1.4", 1_480_000)).status).toBe("push");
  });

  it("is push when only staging has SpecHub's version", () => {
    expect(judgeLanguage(sheet("v1.3"), sheet("v1.4"), hub("1.4")).status).toBe("push");
    expect(judgeLanguage(null, sheet("v1.4"), hub("1.4")).status).toBe("push");
  });

  it("is todo when neither side has it", () => {
    expect(judgeLanguage(sheet("v1.3"), sheet("v1.3"), hub("1.4")).status).toBe("todo");
    expect(judgeLanguage(null, null, hub("1.4")).status).toBe("todo");
  });

  it("is newer when the site is ahead of SpecHub", () => {
    expect(judgeLanguage(sheet("v1.5"), sheet("v1.5"), hub("1.4")).status).toBe("newer");
  });

  it("is prodnewer when production is ahead of staging, even if production matches SpecHub", () => {
    expect(judgeLanguage(sheet("v1.4"), sheet("v1.3"), hub("1.4")).status).toBe("prodnewer");
    expect(judgeLanguage(sheet("v1.4"), null, hub("1.4")).status).toBe("prodnewer");
  });

  it("doesn't call a size difference diff when SpecHub has no file size", () => {
    expect(judgeLanguage(sheet("v1.4", { filesize: 1 }), sheet("v1.4", { filesize: 1 }), hub("1.4", null)).status).toBe("ok");
  });
});

describe("judgeLanguage without SpecHub", () => {
  it("compares production with staging only", () => {
    expect(judgeLanguage(sheet("v1.2"), sheet("v1.2"), null).status).toBe("same");
    expect(judgeLanguage(sheet("v1.1"), sheet("v1.2"), null).status).toBe("push");
    expect(judgeLanguage(null, null, null).status).toBe("notyet");
  });

  it("is push when staging replaced the file under the same version", () => {
    const production = sheet("v1.2", { uploadedAt: "2026-05-01T00:00:00.000Z" });
    const staging = sheet("v1.2", { uploadedAt: "2026-09-01T00:00:00.000Z" });
    expect(judgeLanguage(production, staging, null).status).toBe("push");
  });

  it("is mismatch when versions can't be compared", () => {
    expect(judgeLanguage(sheet("", { fileVersion: "" }), sheet("v1.2"), null).status).toBe("mismatch");
  });
});

describe("judgeSite", () => {
  const ecw536: SpecHubBaseline = { en: hub("1.3"), ja: hub("1.4"), zh: hub("1.2") };

  it("reports nothing wrong for a site that has SpecHub's version", () => {
    const [p, s] = pushed(sheet("v1.3"));
    const verdict = judgeSite("EU", "ECW536", p, s, ecw536);
    expect(verdict).toMatchObject({ status: "ok", summary: "英文 v1.3", issues: [] });
  });

  it("names the missing language on a site with no datasheet in it", () => {
    const verdict = judgeSite("TW", "ECW536", side([]), side([]), ecw536);
    expect(verdict.status).toBe("todo");
    expect(verdict.missing).toEqual([expect.objectContaining({ language: "zh", status: "todo" })]);
    expect(verdict.issues).toEqual(["TW：正式站、測試站都沒有 ECW536 的繁中 Datasheet，SpecHub 已有 v1.2"]);
  });

  it("doesn't ask TW for English when it already has the Chinese sheet", () => {
    const [p, s] = pushed(sheet("v1.2", { language: "zh", filename: "DS_Cloud_ECW536_v1.2_zh.pdf" }));
    const verdict = judgeSite("TW", "ECW536", p, s, ecw536);
    expect(verdict.status).toBe("ok");
    expect(verdict.issues).toEqual([]);
  });

  it("doesn't compare a language the site doesn't publish", () => {
    const [p, s] = pushed(sheet("v1.0"));
    const verdict = judgeSite("JP", "ECW536", p, s, ecw536);
    expect(verdict.rows[0]).toMatchObject({ status: "skip", why: "這站不放英文版，不比對" });
    expect(verdict.issues).toEqual(["JP：正式站、測試站都沒有 ECW536 的日文 Datasheet，SpecHub 已有 v1.4"]);
  });

  it("lists series sheets without comparing them, and says when that's all there is", () => {
    const series = sheet("v1.8", { language: "ja", scope: "series", filename: "DS_EnGenius-Cloud-APs_JP_v1.8.pdf" });
    const [p, s] = pushed(series);
    const verdict = judgeSite("JP", "ECW536", p, s, ecw536);
    expect(verdict.rows[0].status).toBe("skip");
    expect(verdict.status).toBe("todo");
    expect(verdict.missing[0].why).toBe("只有系列 Datasheet，SpecHub 已有單台 v1.4");
    expect(verdict.issues).toEqual(["JP：產品頁只有系列 Datasheet，SpecHub 已有日文單台 v1.4"]);
  });

  it("puts the overwrite warning first", () => {
    const verdict = judgeSite("IN", "ECW536", side([sheet("v1.3")]), side([sheet("v1.2")]), ecw536);
    expect(verdict.status).toBe("prodnewer");
    expect(verdict.issues[0]).toContain("下次推送會蓋回 v1.2");
  });

  it("flags another model's sheet on the page", () => {
    const wrong = sheet("v1.2", { scope: "other_model", otherModels: ["ECW510P"], filename: "DS_Cloud_ECW510P_v1.2.pdf" });
    const [p, s] = pushed(wrong);
    const verdict = judgeSite("EU", "ECW510", p, s, null);
    expect(verdict.status).toBe("wrong_model");
    expect(verdict.issues).toContain("EU：產品頁掛的是其他型號的 Datasheet（ECW510P：DS_Cloud_ECW510P_v1.2.pdf）");
  });

  it("flags a version field that disagrees with the file name, or is blank", () => {
    const [p1, s1] = pushed(sheet("v1.3", { versionField: "v1.2" }));
    expect(judgeSite("EU", "ECW536", p1, s1, ecw536).issues).toContain("EU：DS_Cloud_ECW536_v1.3.pdf 的版本欄位是 v1.2，但檔名是 v1.3");
    const [p2, s2] = pushed(sheet("v1.3", { versionField: "" }));
    expect(judgeSite("EU", "ECW536", p2, s2, ecw536).issues).toContain("EU：DS_Cloud_ECW536_v1.3.pdf 的版本欄位空白");
  });

  it("flags a published sheet that isn't on the page, and doesn't count it as on the site", () => {
    const [p, s] = pushed(sheet("v1.3", { onPage: false }));
    const verdict = judgeSite("EU", "ECW536", p, s, ecw536);
    expect(verdict.issues).toContain("EU：已上傳 DS_Cloud_ECW536_v1.3.pdf，但產品頁沒有顯示");
    expect(verdict.status).toBe("todo");
  });

  it("flags two single sheets in one language on the same page", () => {
    const a = sheet("v1.2");
    const b = sheet("v1.3");
    const verdict = judgeSite("EU", "ECW536", side([a, b]), side([{ ...a }, { ...b }]), ecw536);
    expect(verdict.issues).toContain("EU：正式站產品頁同時顯示 2 份英文單台 Datasheet（v1.2、v1.3）");
  });

  it("treats a missing product page as not sold there, not as a problem", () => {
    expect(judgeSite("IN", "ECW536", side([], false), side([], false), ecw536)).toMatchObject({ status: "nopage", issues: [] });
  });

  it("says when the page exists only on staging, even before it has a datasheet", () => {
    const verdict = judgeSite("EU", "ECW560", side([], false), side([]), null);
    expect(verdict.status).toBe("push");
    expect(verdict.issues).toContain("EU：產品頁只在測試站，等推送");
  });

  it("reports a failed site as failed", () => {
    const failed = { error: "逾時", pageFound: false, datasheets: [] };
    expect(judgeSite("APAC", "ECW536", failed, side([]), ecw536)).toMatchObject({ status: "fail", issues: ["APAC：查詢失敗（逾時）"] });
  });

  it("notes a page with no datasheet at all", () => {
    expect(judgeSite("EU", "ECW212L", side([]), side([]), {}).issues).toEqual(["EU：產品頁沒有 Datasheet（正式站、測試站都沒有）"]);
  });
});
