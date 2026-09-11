import { describe, expect, it } from "vitest";
import { citedFigures, citedIndexes, isSafeImageUrl } from "./figures";

const src = (title: string, image_urls: string[] = []) => ({ title, image_urls });

describe("citedIndexes", () => {
  it("returns citation numbers in order of first appearance, multi-citations included", () => {
    expect(citedIndexes("A [2]. B [1, 3]. C [2].")).toEqual([2, 1, 3]);
  });

  it("ignores text with no citations", () => {
    expect(citedIndexes("no refs here, [a link](x) either")).toEqual([]);
  });
});

describe("citedFigures", () => {
  const sources = [
    src("Gateway VPN", ["https://img/vpn-1.png", "https://img/vpn-2.png", "https://img/vpn-3.png"]),
    src("Uncited AP guide", ["https://img/ap.png"]),
    src("Craft AI SRS", ["/api/knowledge-assets/internal_doc/craft-ai-srs/diagrams/stack.svg"]),
  ];

  it("shows only images from cited sources, in citation order", () => {
    // Source 2 was retrieved but never cited — its screenshot must not appear
    // next to an answer that didn't use it.
    const figs = citedFigures("Stack [3]. VPN [1].", sources);
    expect(figs.map((f) => f.citation)).toEqual([3, 1, 1]);
    expect(figs.map((f) => f.url)).not.toContain("https://img/ap.png");
  });

  it("caps images per source and in total", () => {
    expect(citedFigures("VPN [1].", sources)).toHaveLength(2);
    expect(citedFigures("VPN [1]. Stack [3].", sources, { max: 1 })).toHaveLength(1);
  });

  it("drops the same image reached through two sources", () => {
    const dup = [src("A", ["https://img/x.png"]), src("B", ["https://img/x.png"])];
    expect(citedFigures("[1] [2]", dup)).toHaveLength(1);
  });

  it("ignores out-of-range citations and unsafe URLs", () => {
    const risky = [
      src("A", ["javascript:alert(1)", "//evil.example/x.png", "data:image/png;base64,AA", "https://ok/x.png"]),
    ];
    expect(citedFigures("[1] [7]", risky, { perSource: 4 }).map((f) => f.url)).toEqual(["https://ok/x.png"]);
  });

  it("returns nothing without sources", () => {
    expect(citedFigures("[1]", undefined)).toEqual([]);
  });
});

describe("isSafeImageUrl", () => {
  it("allows http(s) and same-origin paths only", () => {
    expect(isSafeImageUrl("https://files.gitbook.com/x.png")).toBe(true);
    expect(isSafeImageUrl("/api/knowledge-assets/internal_doc/p/x.svg")).toBe(true);
    expect(isSafeImageUrl("//evil.example/x.png")).toBe(false);
    expect(isSafeImageUrl("/\\evil.example/x.png")).toBe(false);
    expect(isSafeImageUrl("javascript:alert(1)")).toBe(false);
  });
});
