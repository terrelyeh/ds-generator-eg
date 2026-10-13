import { describe, expect, it } from "vitest";
import { parsePdfName, pickPrunable } from "./prune-pdfs";

describe("parsePdfName", () => {
  it("reads version and locale suffix", () => {
    expect(parsePdfName("DS_Cloud_ECW526_v1.4_ja.pdf")).toEqual({ version: "1.4", suffix: "ja" });
    expect(parsePdfName("DS_Cloud_ECW526_v1.10.pdf")).toEqual({ version: "1.10", suffix: null });
    expect(parsePdfName("DS_AI Server_S41_v1.0.pdf")).toEqual({ version: "1.0", suffix: null });
  });

  it("rejects names that aren't generated datasheets", () => {
    expect(parsePdfName("notes.pdf")).toBeNull();
    expect(parsePdfName("DS_Cloud_ECW526_v1.4_ja.png")).toBeNull();
  });
});

describe("pickPrunable", () => {
  const storageNames = [
    "DS_Cloud_ECW526_v1.2.pdf",
    "DS_Cloud_ECW526_v1.3.pdf",
    "DS_Cloud_ECW526_v1.4.pdf",
    "DS_Cloud_ECW526_v1.2_ja.pdf",
    "DS_Cloud_ECW526_v1.3_ja.pdf",
  ];
  const base = {
    storageNames,
    currentName: "DS_Cloud_ECW526_v1.4.pdf",
    suffix: null,
    markedVersions: [],
    driveNames: storageNames,
  };

  it("prunes older copies of the same language that Drive also holds", () => {
    expect(pickPrunable(base)).toEqual(["DS_Cloud_ECW526_v1.2.pdf", "DS_Cloud_ECW526_v1.3.pdf"]);
  });

  it("never prunes the file just written", () => {
    expect(pickPrunable(base)).not.toContain("DS_Cloud_ECW526_v1.4.pdf");
  });

  it("leaves other languages alone", () => {
    expect(pickPrunable(base).some((n) => n.endsWith("_ja.pdf"))).toBe(false);
    expect(
      pickPrunable({ ...base, currentName: "DS_Cloud_ECW526_v1.3_ja.pdf", suffix: "ja" }),
    ).toEqual(["DS_Cloud_ECW526_v1.2_ja.pdf"]);
  });

  it("keeps a version marked on the website tab", () => {
    expect(pickPrunable({ ...base, markedVersions: ["1.3"] })).toEqual(["DS_Cloud_ECW526_v1.2.pdf"]);
  });

  it("keeps anything Drive doesn't hold — Drive is not a complete archive", () => {
    expect(
      pickPrunable({ ...base, driveNames: ["DS_Cloud_ECW526_v1.3.pdf", "DS_Cloud_ECW526_v1.4.pdf"] }),
    ).toEqual(["DS_Cloud_ECW526_v1.3.pdf"]);
    expect(pickPrunable({ ...base, driveNames: [] })).toEqual([]);
  });

  it("keeps files under an old prefix, which never share the Drive folder", () => {
    const names = ["DS_Broadband EOC_EOC610_v1.0.pdf", "DS_Broadband Outdoor_EOC610_v1.1.pdf"];
    expect(
      pickPrunable({
        storageNames: names,
        currentName: "DS_Broadband Outdoor_EOC610_v1.1.pdf",
        suffix: null,
        markedVersions: [],
        driveNames: ["DS_Broadband Outdoor_EOC610_v1.1.pdf"],
      }),
    ).toEqual([]);
  });
});
