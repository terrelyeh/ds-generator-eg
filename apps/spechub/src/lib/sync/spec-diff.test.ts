import { describe, expect, it } from "vitest";
import { diffSpecTables, findDuplicateSections, type SpecSectionLike } from "./spec-diff";

const compliance: SpecSectionLike = {
  category: "Compliance",
  items: [{ label: "Regulatory Compliance", value: "FCC Part 15 (Class B)\nIC\nCE EMC" }],
};
const dims: SpecSectionLike = {
  category: "Dimensions & Weight",
  items: [
    { label: "Device Dimensions & Weights", value: "Weight: 2.14 lbs." },
    { label: "Package Contents", value: "Power adapter" },
  ],
};

describe("diffSpecTables", () => {
  it("reports nothing when the tables are identical", () => {
    expect(diffSpecTables([dims, compliance], [dims, compliance])).toEqual([]);
  });

  it("sees a stored duplicate section the sheet no longer has (ESG320, 2026-10-16)", () => {
    const changes = diffSpecTables([dims, compliance, compliance], [dims, compliance]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ field: "Spec table layout", type: "modified" });
    expect(changes[0].from).toBe("Dimensions & Weight (2) · Compliance (1) · Compliance (1)");
    expect(changes[0].to).toBe("Dimensions & Weight (2) · Compliance (1)");
  });

  it("sees reordered sections", () => {
    expect(diffSpecTables([dims, compliance], [compliance, dims])).toHaveLength(1);
  });

  it("sees reordered rows inside a section", () => {
    const swapped = { ...dims, items: [...dims.items].reverse() };
    expect(diffSpecTables([dims], [swapped])).toHaveLength(1);
  });

  it("keeps the readable per-item entries when values change, without adding a layout entry", () => {
    const edited = { ...compliance, items: [{ label: "Regulatory Compliance", value: "FCC" }] };
    expect(diffSpecTables([compliance], [edited])).toEqual([
      { field: "Compliance > Regulatory Compliance", from: compliance.items[0].value, to: "FCC", type: "modified" },
    ]);
  });

  it("reports added and removed sections by name", () => {
    expect(diffSpecTables([dims], [dims, compliance])).toEqual([
      { field: "Section: Compliance", from: null, to: "(new section)", type: "added" },
    ]);
    expect(diffSpecTables([dims, compliance], [dims])).toEqual([
      { field: "Section: Compliance", from: "(removed)", to: null, type: "removed" },
    ]);
  });
});

describe("findDuplicateSections", () => {
  it("names each repeated category once, with how many times it appears", () => {
    expect(findDuplicateSections([dims, compliance, compliance])).toEqual([{ category: "Compliance", count: 2 }]);
    expect(findDuplicateSections([compliance, dims, compliance, dims, compliance])).toEqual([
      { category: "Compliance", count: 3 },
      { category: "Dimensions & Weight", count: 2 },
    ]);
  });

  it("is empty for a normal table", () => {
    expect(findDuplicateSections([dims, compliance])).toEqual([]);
    expect(findDuplicateSections([])).toEqual([]);
  });
});
