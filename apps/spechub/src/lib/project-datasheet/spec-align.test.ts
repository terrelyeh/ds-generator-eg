import { describe, expect, it } from "vitest";
import { findSplitSpecs } from "./spec-align";
import { normalizeKey } from "./resolve";
import type { ResolvedCell, ResolvedRow } from "./types";

/**
 * Build a spec row whose columns are given as strings; `null` means the model
 * has no value for it. Column count is whatever the caller passes, so a
 * three-supplier document is three entries.
 */
function row(label: string, cols: (string | null)[]): ResolvedRow {
  const cells: ResolvedCell[] = cols.map((v) =>
    v === null
      ? { value: "TBD", origin: "blank", isBlank: true }
      : { value: v, origin: "source", isBlank: false },
  );
  return { key: normalizeKey(label), label, group: "spec", cells };
}

describe("findSplitSpecs", () => {
  it("pairs two complementary rows that are one spec under two names", () => {
    const splits = findSplitSpecs([
      row("Operating Temperature", ["-20 ~ 60 °C", null]),
      row("Environment", [null, "-10 ~ 50 °C"]),
    ]);

    expect(splits).toHaveLength(1);
    expect([splits[0].into.label, splits[0].from.label].sort()).toEqual([
      "Environment",
      "Operating Temperature",
    ]);
  });

  it("refuses two rows that share a value shape but are named as different specs", () => {
    // Both values end in W. The synonym table is what stops this: the labels
    // are in different groups, so the shape never gets a vote.
    expect(
      findSplitSpecs([
        row("Power Consumption", ["12 W", null]),
        row("PoE Input", [null, "15 W"]),
      ]),
    ).toEqual([]);
  });

  it("refuses to fold storage temperature into operating temperature", () => {
    // Both are a °C range, so shape alone would pair them and relabel a
    // storage range as the operating one on a document a customer reads.
    expect(
      findSplitSpecs([
        row("Operating Temperature", ["-20 ~ 60 °C", null]),
        row("Storage Temperature", [null, "-40 ~ 85 °C"]),
      ]),
    ).toEqual([]);
  });

  it("refuses rows where any one model carries both — two real specs", () => {
    expect(
      findSplitSpecs([
        row("Operating Temperature", ["-20 ~ 60 °C", "0 ~ 40 °C"]),
        row("Environment", ["indoor", null]),
      ]),
    ).toEqual([]);
  });

  /**
   * The identity guard behind `merge()`.
   *
   * A finding is coded `same_spec_split:<from.key>`, so three columns naming
   * one spec three ways produce several pairs that SHARE a code and differ
   * only by which row survives. Looking a merge plan up by code alone folds
   * the wrong pair; the route matches on (code, modelId, rowKey) instead.
   */
  it("produces pairs that share a code, so code alone cannot identify one", () => {
    const splits = findSplitSpecs([
      row("Operating Temperature", ["-20 ~ 60 °C", null, null]),
      row("Environment", [null, "-10 ~ 50 °C", null]),
      row("Working Temperature", [null, null, "-30 ~ 70 °C"]),
    ]);

    expect(splits.length).toBeGreaterThan(1);

    const codes = splits.map((s) => `same_spec_split:${s.from.key}`);
    const identities = splits.map((s) => `same_spec_split:${s.from.key}||${s.into.key}`);

    expect(new Set(codes).size).toBeLessThan(splits.length);
    expect(new Set(identities).size).toBe(splits.length);
  });
});
