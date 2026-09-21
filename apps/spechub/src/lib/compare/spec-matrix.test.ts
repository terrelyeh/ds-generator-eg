import { describe, expect, it } from "vitest";
import { filterMatrix, isCheckValue, rowDiffers, type SpecCategory } from "./spec-matrix";

const models = ["A", "B", "C"];

const categories: SpecCategory[] = [
  {
    name: "Optics",
    rows: [
      { label: "Resolution", values: { A: "5MP", B: "5MP", C: "4K" } },
      { label: "Field of View", values: { A: "H: 102°", B: "H: 102° ", C: "h: 102°" } },
    ],
  },
  {
    name: "Advanced AI Analytics",
    rows: [
      { label: "Room Occupation", values: { A: "V", B: "v", C: "✓" } },
      { label: "Facial Recognition", values: { A: "", C: "V" } },
    ],
  },
];

describe("isCheckValue", () => {
  it("accepts every spelling of the check mark", () => {
    expect(isCheckValue("V")).toBe(true);
    expect(isCheckValue(" v ")).toBe(true);
    expect(isCheckValue("✔")).toBe(true);
    expect(isCheckValue("●")).toBe(true);
  });

  it("rejects real values and blanks", () => {
    expect(isCheckValue("VGA")).toBe(false);
    expect(isCheckValue("")).toBe(false);
    expect(isCheckValue(undefined)).toBe(false);
  });
});

describe("rowDiffers", () => {
  it("ignores whitespace, case and check-mark spelling", () => {
    expect(rowDiffers(categories[0].rows[1], models)).toBe(false);
    expect(rowDiffers(categories[1].rows[0], models)).toBe(false);
  });

  it("treats a missing value as a difference", () => {
    expect(rowDiffers(categories[1].rows[1], models)).toBe(true);
  });

  it("only looks at the models it is given", () => {
    expect(rowDiffers(categories[0].rows[0], ["A", "B"])).toBe(false);
    expect(rowDiffers(categories[0].rows[0], ["A"])).toBe(false);
  });
});

describe("filterMatrix", () => {
  it("returns everything for an empty filter", () => {
    expect(filterMatrix(categories, { models, query: "", onlyDifferences: false })).toEqual(categories);
  });

  it("keeps only differing rows and drops emptied categories", () => {
    const out = filterMatrix(categories, { models: ["A", "C"], query: "", onlyDifferences: true });
    expect(out.map((c) => c.name)).toEqual(["Optics", "Advanced AI Analytics"]);
    expect(out[0].rows.map((r) => r.label)).toEqual(["Resolution"]);
    expect(out[1].rows.map((r) => r.label)).toEqual(["Facial Recognition"]);
    expect(filterMatrix(categories, { models: ["A", "B"], query: "", onlyDifferences: true })).toEqual([]);
  });

  it("keeps a whole category when the query matches its name", () => {
    const out = filterMatrix(categories, { models, query: "analytics", onlyDifferences: false });
    expect(out).toHaveLength(1);
    expect(out[0].rows).toHaveLength(2);
  });

  it("matches values only in the shown models", () => {
    expect(filterMatrix(categories, { models, query: "4k", onlyDifferences: false })).toHaveLength(1);
    expect(filterMatrix(categories, { models: ["A", "B"], query: "4k", onlyDifferences: false })).toHaveLength(0);
  });
});
