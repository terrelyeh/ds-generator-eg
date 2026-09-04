import { describe, expect, it } from "vitest";
import { lineParityBudget, lineParityCheck } from "./cover-layout";

describe("lineParityCheck", () => {
  it("measures the translation with the same ruler the budget was built with", () => {
    const texts = ["Dual 2.5G PoE ports", "x".repeat(80)];
    const budget = lineParityBudget({ texts, block: "features", targetLocale: "es" });
    const check = lineParityCheck({
      texts,
      translated: ["Dos puertos PoE 2.5G", "y".repeat(80)],
      block: "features",
      targetLocale: "es",
    });
    expect(check.map((c) => c.sourceLines)).toEqual(budget.map((b) => b.sourceLines));
    expect(check.every((c) => !c.over)).toBe(true);
  });

  it("flags the item that gained a line, and only that one", () => {
    const check = lineParityCheck({
      texts: ["Short", "Also short"],
      translated: ["Corto", "z".repeat(200)],
      block: "features",
      targetLocale: "es",
    });
    expect(check[0].over).toBe(false);
    expect(check[1].over).toBe(true);
    expect(check[1].gotLines).toBeGreaterThan(check[1].sourceLines);
  });
});
