import { describe, expect, it } from "vitest";
import { chunkText, MAX_CHUNK_CHARS, MIN_STANDALONE_CHARS } from "./chunk";

const para = (n: number) => "x".repeat(n);

describe("chunkText", () => {
  it("merges a section too short to stand on its own into the next one", () => {
    // Refined articles use boilerplate headings — "Symptom", "Root Cause",
    // "Solution" — which alone produce fragments carrying too little context
    // to answer anything, and split the problem from its answer.
    const md = `## Symptom\n\nThe AP reboots.\n\n## Root Cause\n\n${para(900)}`;
    const chunks = chunkText(md, "ECW536 reboot loop");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("The AP reboots.");
    expect(chunks[0].content).toContain(para(900));
  });

  it("qualifies a generic heading with the article title, and leaves a specific one alone", () => {
    // A citation reading "📎 Symptom" tells the reader nothing, and the title
    // carries semantic weight at retrieval time.
    const generic = chunkText(`## Overview\n\n${para(900)}`, "ECW536 reboot loop");
    expect(generic[0].title).toBe("ECW536 reboot loop — Overview");
    const specific = chunkText(`## SFP+ Module Troubleshooting\n\n${para(900)}`, "ECW536 reboot loop");
    expect(specific[0].title).toBe("SFP+ Module Troubleshooting");
  });

  it("splits past the embed ceiling and carries the prefix into every part", () => {
    // The prefix is what keeps a chunk attributable after retrieval; a part
    // that lost it would be a wall of text with no source.
    const body = Array.from({ length: 8 }, () => para(1200)).join("\n\n");
    const chunks = chunkText(`## Specifications\n\n${body}`, "ECS1528P", "Cloud Switch");
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.content.startsWith("[Cloud Switch > ECS1528P]")).toBe(true);
      expect(c.content.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
      expect(c.title).toContain("Part");
    }
  });

  it("never silently drops short-but-intentional content", () => {
    // A one-line FAQ snippet is the whole of what somebody typed.
    const chunks = chunkText("PoE budget is 370 W.", "FAQ");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("PoE budget is 370 W.");
  });

  it("keeps sections that are each big enough apart", () => {
    const md = `## First topic\n\n${para(MIN_STANDALONE_CHARS + 100)}\n\n## Second topic\n\n${para(MIN_STANDALONE_CHARS + 100)}`;
    const chunks = chunkText(md, "Guide");
    expect(chunks).toHaveLength(2);
    expect(chunks.map((c) => c.title)).toEqual(["First topic", "Second topic"]);
  });

  it("folds a trailing runt back rather than emitting it alone", () => {
    const md = `## Body\n\n${para(900)}\n\n## References\n\nSee the datasheet.`;
    const chunks = chunkText(md, "Guide");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("See the datasheet.");
  });

  it("returns nothing for empty input", () => {
    expect(chunkText("   ", "Guide")).toEqual([]);
  });
});
