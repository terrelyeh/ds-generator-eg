import { describe, expect, it } from "vitest";
import { vanishedSourceIds } from "./replace-chunks";

describe("vanishedSourceIds", () => {
  it("is exactly existing minus produced, deduplicated", () => {
    const existing = ["a", "b", "b", "c", "d"]; // one row per chunk, so ids repeat
    const produced = new Set(["a", "c"]);
    expect(vanishedSourceIds(existing, produced).sort()).toEqual(["b", "d"]);
  });

  it("removes nothing when everything was seen, and nothing when nothing existed", () => {
    expect(vanishedSourceIds(["a"], new Set(["a"]))).toEqual([]);
    expect(vanishedSourceIds([], new Set(["a"]))).toEqual([]);
  });
});
