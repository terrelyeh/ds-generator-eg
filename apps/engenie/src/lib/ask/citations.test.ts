import { describe, expect, it } from "vitest";
import { normalizeCitations } from "./citations";

describe("normalizeCitations", () => {
  it("rewrites [Source N] to [N]", () => {
    // Measured on prod: Gemini 3.7 Flash writes every citation this way.
    expect(normalizeCitations("無法再透過 Cloud 管理 [Source 6]。")).toBe("無法再透過 Cloud 管理 [6]。");
  });

  it("handles lists, plurals, full-width brackets and CJK separators", () => {
    expect(normalizeCitations("[Source 1, Source 3]")).toBe("[1, 3]");
    expect(normalizeCitations("[Source 1, 3]")).toBe("[1, 3]");
    expect(normalizeCitations("[Sources 1、2]")).toBe("[1, 2]");
    expect(normalizeCitations("【Source 2】")).toBe("[2]");
    expect(normalizeCitations("[source 4]")).toBe("[4]");
  });

  it("leaves numeric citations and every other bracket alone", () => {
    const s = "路徑 **Configure > VPN** [7]，另見 [Source code](https://x.example) 與 [1, 2]。";
    expect(normalizeCitations(s)).toBe(s);
  });

  it("leaves a marker that is still streaming in for the next frame", () => {
    expect(normalizeCitations("…變更設定 [Source 7")).toBe("…變更設定 [Source 7");
  });
});
