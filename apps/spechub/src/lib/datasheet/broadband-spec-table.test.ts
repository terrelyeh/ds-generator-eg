import { describe, expect, it } from "vitest";
import { buildBroadbandSpecRows, identityBandLabel } from "./broadband-spec-table";

function model(model_name: string, items: [string, string][]) {
  return {
    model_name,
    spec_sections: [
      { sort_order: 0, spec_items: items.map(([label, value], i) => ({ label, value, sort_order: i })) },
    ],
  };
}

const eoc600 = model("EOC600", [
  ["Model Number", "EOC600"],
  ["Chipset", "Qualcomm"],
  ["Memory", "256 MB"],
  ["Antenna", "N/A"],
]);

const ja = {
  "Model Number": "型番",
  Chipset: "チップセット",
  Memory: "メモリ",
  Antenna: "アンテナ",
};

describe("buildBroadbandSpecRows", () => {
  it("prints the locale's labels — EOC's Japanese sheet used to print English", () => {
    expect(buildBroadbandSpecRows([eoc600], ja)).toEqual([
      { label: "チップセット", values: ["Qualcomm"] },
      { label: "メモリ", values: ["256 MB"] },
    ]);
  });

  it("still drops the Model Number row when that label is translated too", () => {
    // The identity filter matches English. Translating first turns the row
    // into 型番, the regex no longer matches, and the model number prints
    // twice — once in the band above the table and once inside it.
    const labels = buildBroadbandSpecRows([eoc600], ja).map((r) => r.label);
    expect(labels).not.toContain("型番");
    expect(labels).not.toContain("Model Number");
  });

  it("keeps English for a label with no translation, or an empty one", () => {
    const rows = buildBroadbandSpecRows([eoc600], { Chipset: "", Memory: "  " });
    expect(rows.map((r) => r.label)).toEqual(["Chipset", "Memory"]);
  });

  it("is the English sheet when no labels are given", () => {
    expect(buildBroadbandSpecRows([eoc600]).map((r) => r.label)).toEqual(["Chipset", "Memory"]);
  });

  it("lines up one value per model on a series sheet, blank where a model has none", () => {
    const cpe = model("EOC650", [["Chipset", "MediaTek"], ["Range", "5 km"]]);
    expect(buildBroadbandSpecRows([eoc600, cpe])).toEqual([
      { label: "Chipset", values: ["Qualcomm", "MediaTek"] },
      { label: "Memory", values: ["256 MB", ""] },
      { label: "Range", values: ["", "5 km"] },
    ]);
  });
});

describe("identityBandLabel", () => {
  // EOC's sheet calls the row "Model #"; the PM translated exactly that.
  const eoc = model("EOC610", [["Model Name", "Broadband Outdoor CPE"], ["Model #", "EOC610"], ["Chipset", "IPQ5018"]]);

  it("uses the translation of the sheet's own model-number label", () => {
    expect(identityBandLabel([eoc], { "Model #": "型番", "Model Name": "製品名" }, "Model Number")).toBe("型番");
  });

  it("falls back to the locale's word when the line never translated it", () => {
    expect(identityBandLabel([eoc], {}, "型番")).toBe("型番");
    expect(identityBandLabel([eoc], { "Model #": "  " }, "型號")).toBe("型號");
  });

  it("does not take the Model Name translation — that row is not the number", () => {
    expect(identityBandLabel([eoc], { "Model Name": "製品名" }, "Model Number")).toBe("Model Number");
  });

  it("reads any spelling of the number row", () => {
    const other = model("X1", [["Model Number", "X1"]]);
    expect(identityBandLabel([other], { "Model Number": "型號" }, "Model Number")).toBe("型號");
  });
});

