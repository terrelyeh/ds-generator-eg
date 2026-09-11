import { describe, expect, it } from "vitest";
import { normalizeCitations, stripCitations } from "./citations";

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

describe("stripCitations", () => {
  it("removes markers together with the space in front of them", () => {
    // Otherwise every Gemini 3.7 sentence in the widget ends "設定 。".
    expect(stripCitations("無法變更設定 [7]。網段不能重疊 [2, 3]。")).toBe("無法變更設定。網段不能重疊。");
    expect(stripCitations("supports WiFi 7 [3].")).toBe("supports WiFi 7.");
  });

  it("never joins lines and leaves links and other brackets alone", () => {
    expect(stripCitations("line one [2]\nline two")).toBe("line one\nline two");
    const s = "see [the guide](https://x.example) and **Configure > VPN**";
    expect(stripCitations(s)).toBe(s);
  });

  it("works on what normalizeCitations produces", () => {
    expect(stripCitations(normalizeCitations("開啟即可 [Source 1]。"))).toBe("開啟即可。");
  });
});
