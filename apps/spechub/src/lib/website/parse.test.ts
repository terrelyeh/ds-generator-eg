import { describe, expect, it } from "vitest";
import {
  compareVersions,
  decodeEntities,
  explicitLanguage,
  fileFromRest,
  languageOf,
  looksLikeDatasheet,
  modelTokens,
  parseVersion,
  productFromRest,
  sameVersion,
  scopeOf,
  versionText,
  wifiGeneration,
} from "./parse";

describe("versionText", () => {
  it("reads v-prefixed and bare dotted versions", () => {
    expect(versionText("DS_Cloud_ECW536_v1.3.pdf")).toBe("v1.3");
    expect(versionText("DS_Cloud_ECW536_V2.pdf")).toBe("v2");
    expect(versionText("Datasheet 1.4")).toBe("v1.4");
  });

  it("does not read dates as versions", () => {
    expect(versionText("DS_ECW220_03.08.2022.pdf")).toBe("");
    expect(versionText("DS_ECW220_2022-08-03_v1.2.pdf")).toBe("v1.2");
    expect(versionText("CE_DoC_ECW536s_20260129.pdf")).toBe("");
    expect(versionText("DS_ECW220_09092024.pdf")).toBe("");
    expect(versionText("DS_ECW220_240813_v1.1.pdf")).toBe("v1.1");
  });

  it("does not read a date as the version when nothing else follows it", () => {
    // Without date stripping these read as v03.08.2022 and v20190418.
    expect(versionText("DS_ECW220_03.08.2022_EU.pdf")).toBe("");
    expect(versionText("ECW220 Datasheet v20190418")).toBe("");
  });

  it("returns empty for nothing", () => {
    expect(versionText("")).toBe("");
    expect(versionText(null)).toBe("");
  });
});

describe("parseVersion / sameVersion", () => {
  it("drops trailing zeros so v1.0 equals v1", () => {
    expect(parseVersion("v1.0")).toEqual([1]);
    expect(sameVersion("v1.0", "v1")).toBe(true);
  });

  it("compares each part as a number, so v1.10 is newer than v1.9", () => {
    expect(parseVersion("v1.30")).toEqual([1, 30]);
    expect(compareVersions(parseVersion("v1.10")!, parseVersion("v1.9")!)).toBeGreaterThan(0);
  });

  it("treats the dotless form as the same version", () => {
    expect(sameVersion("v20", "v2.0")).toBe(true);
  });

  it("tells different versions apart", () => {
    expect(sameVersion("v1.3", "v1.4")).toBe(false);
  });

  it("does not call a missing version a mismatch", () => {
    expect(sameVersion("", "v1.4")).toBe(true);
  });
});

describe("language", () => {
  it("reads the language marker in a file name", () => {
    expect(explicitLanguage("DS_Cloud_ECW536_v1.4_ja")).toBe("ja");
    expect(explicitLanguage("DS_EnGenius-Cloud-APs_JP_v1.8")).toBe("ja");
    expect(explicitLanguage("DS_EnGenius-FIT-Series-APs_ZH_v1.2")).toBe("zh");
    expect(explicitLanguage("規格手冊_Cloud7 4x4x4_ECW536 Datasheet_EN")).toBe("en");
    expect(explicitLanguage("ECW536 データシート")).toBe("ja");
    expect(explicitLanguage("DS_Cloud_ECW536_v1.3")).toBeNull();
  });

  it("trusts the file name over a wrong language field", () => {
    expect(languageOf("DS_Cloud_ECW536_v1.4_ja.pdf", "Cloud7 4x4x4_ECW536 Datasheet", "en")).toBe("ja");
  });

  it("falls back to the field, then English", () => {
    expect(languageOf("DS_Cloud_ECW215.pdf", "ECW215 Datasheet", "zh-hant")).toBe("zh");
    expect(languageOf("DS_Cloud_ECW215.pdf", "ECW215 Datasheet", "")).toBe("en");
  });
});

describe("looksLikeDatasheet", () => {
  it("accepts datasheet names and DS_ files", () => {
    expect(looksLikeDatasheet("Cloud7 4x4x4_ECW536 Datasheet", "")).toBe(true);
    expect(looksLikeDatasheet("", "DS_Cloud_ECW536_v1.3.pdf")).toBe(true);
  });

  it("rejects other documents even when the title says datasheet", () => {
    expect(looksLikeDatasheet("ECW536 Datasheet", "ECW536_Quick_Installation_Guide.pdf")).toBe(false);
    expect(looksLikeDatasheet("Cloud7_4x4x4_ECW536_firmware_v1.8.114-1.bin", "fw.bin")).toBe(false);
  });
});

describe("scopeOf", () => {
  const known = new Set(["ECW536", "ECW536S", "ECW510", "ECW510P", "ECW201L-POE", "ECW201L-AC", "ECW201L"]);

  it("classes a sheet naming only this model as single", () => {
    expect(scopeOf("ECW536", "Cloud7 4x4x4_ECW536 Datasheet", "DS_Cloud_ECW536_v1.3.pdf", known).scope).toBe("single");
  });

  it("classes a sheet for another model as other_model", () => {
    expect(scopeOf("ECW510", "ECW510P Datasheet", "DS_Cloud_ECW510P_v1.2.pdf", known)).toEqual({
      scope: "other_model",
      otherModels: ["ECW510P"],
    });
  });

  it("classes a sheet naming several models as series", () => {
    expect(scopeOf("ECW510", "ECW510 / ECW510P Datasheet", "DS.pdf", known)).toEqual({
      scope: "series",
      otherModels: ["ECW510P"],
    });
  });

  it("classes a sheet naming no model as series, or platform when it is one", () => {
    expect(scopeOf("ECW536", "Cloud Managed Access Points", "DS_EnGenius-Cloud-APs_JP_v1.8.pdf", known).scope).toBe("series");
    expect(scopeOf("ECW536", "EnGenius Cloud Management Datasheet", "DS_Cloud_Management.pdf", known).scope).toBe("platform");
  });

  it("does not read IP66 or R20 as models", () => {
    expect(scopeOf("ECW536", "ECW536 IP66 R20 Datasheet", "", known).scope).toBe("single");
  });

  it("keeps a hyphenated model's own sheet single even when its prefix is also a model", () => {
    expect(scopeOf("ECW201L-POE", "ECW201L-PoE Datasheet", "DS_Cloud_ECW201L-PoE_v1.0.pdf", known).scope).toBe("single");
    expect(modelTokens("DS_Cloud_ECW201L-PoE_v1.0.pdf", known)).toEqual(new Set(["ECW201L-POE"]));
  });

  it("still splits two models joined by a hyphen", () => {
    expect(modelTokens("DS_ECW536-ECW536S.pdf", known)).toEqual(new Set(["ECW536", "ECW536S"]));
  });
});

describe("fileFromRest", () => {
  const record = {
    id: 325170,
    status: "publish",
    title: { rendered: "Cloud7 4x4x4_ECW536 Datasheet &#8211; EU" },
    acf: {
      type: "data-sheet",
      version: " v1.3 ",
      language: "en",
      region: "eu",
      download_link: {
        filename: "DS_Cloud_ECW536_v1.3.pdf",
        filesize: 1356129,
        date: "2024-08-30 03:13:01",
        modified: "2024-08-30 03:43:53",
        author: "12",
        url: "https://example.com/DS_Cloud_ECW536_v1.3.pdf",
      },
    },
  };

  it("keeps what the checks need, with the later attachment time", () => {
    expect(fileFromRest(record)).toEqual({
      id: 325170,
      title: "Cloud7 4x4x4_ECW536 Datasheet – EU",
      status: "publish",
      type: "data-sheet",
      versionField: "v1.3",
      languageField: "en",
      region: "eu",
      filename: "DS_Cloud_ECW536_v1.3.pdf",
      filesize: 1356129,
      uploadedAt: "2024-08-30T03:43:53.000Z",
      uploaderId: "12",
      url: "https://example.com/DS_Cloud_ECW536_v1.3.pdf",
    });
  });

  it("copes with files that are external links or have no attachment", () => {
    const external = fileFromRest({ id: 1, title: { rendered: "Firmware" }, acf: { type: "firmware", download_link: false, external_link: { url: "https://x.test/fw/ECW536_v1.8.bin" } } });
    expect(external?.filename).toBe("ECW536_v1.8.bin");
    expect(external?.filesize).toBeNull();
    expect(fileFromRest({ id: 2, acf: { download_link: null } })?.uploadedAt).toBeNull();
    expect(fileFromRest({ title: "no id" })).toBeNull();
  });
});

describe("productFromRest / wifiGeneration", () => {
  it("takes the model and category from the page URL", () => {
    const product = productFromRest({
      id: 9,
      link: "https://www.engeniustech.com/eu/products/access-point/indoor-access-point/ecw536/",
      title: { rendered: "Cloud7 4x4x4" },
      acf: { product_files: [{ ID: 325170 }, { ID: 325171 }], technology_type: ["wifi7"] },
    });
    expect(product).toMatchObject({ model: "ECW536", category: "access-point/indoor-access-point", fileIds: [325170, 325171] });
    expect(wifiGeneration(product!)).toEqual({ generation: "Wi-Fi 7", source: "field" });
  });

  it("reads old /product/ pages as legacy with the type field", () => {
    const product = productFromRest({ id: 10, link: "https://www.engeniustech.com/jp/product/ecw220/", acf: { type: "access_point" } });
    expect(product).toMatchObject({ model: "ECW220", category: "legacy/access-point" });
  });

  it("falls back to the name, then the page text, and says so", () => {
    const base = { id: 11, link: "https://x.test/tw/products/access-point/ecw336/", acf: {} };
    expect(wifiGeneration(productFromRest({ ...base, title: { rendered: "Cloud6E 4x4x4" } })!)).toEqual({ generation: "Wi-Fi 6E", source: "name" });
    const fromText = productFromRest({ ...base, title: { rendered: "Outdoor AP" }, acf: { specifications: "<p>IEEE 802.11ax</p>" } })!;
    expect(wifiGeneration(fromText)).toEqual({ generation: "Wi-Fi 6", source: "text" });
  });

  it("gives no generation for products that are not access points", () => {
    const product = productFromRest({ id: 12, link: "https://x.test/eu/products/network-switch/ecs2512fp/", title: { rendered: "Cloud6 Switch" }, acf: {} });
    expect(wifiGeneration(product!)).toEqual({ generation: null, source: null });
  });
});

describe("decodeEntities", () => {
  it("decodes numeric and common named entities", () => {
    expect(decodeEntities("A &amp; B &#8211; C &#x2019; &nbsp;D")).toBe("A & B – C ’  D");
  });
});
