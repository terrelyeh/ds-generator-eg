import { describe, expect, it } from "vitest";
import { capForEmbedding, estimateTokens, EMBED_TOKEN_BUDGET } from "./embeddings";

describe("estimateTokens", () => {
  it("counts CJK by the character, not by the Latin ratio", () => {
    // 3.5 chars per token was the one ratio for every script. On cl100k a
    // CJK character is about a token by itself, so 21 000 characters of
    // Japanese was ~6 000 by the estimate and ~21 000 in fact — over the
    // 8 192 limit, and the whole batch of twenty was refused with it.
    const latin = "The quick brown fox jumps over the lazy dog. ".repeat(10);
    const cjk = "無線基地台支援雙頻並行運作，適合高密度部署環境。".repeat(20);
    expect(estimateTokens(latin)).toBeLessThan(latin.length / 3);
    expect(estimateTokens(cjk)).toBeGreaterThanOrEqual(cjk.length);
  });
});

describe("capForEmbedding", () => {
  it("leaves short text alone and cuts long CJK to the budget", () => {
    const short = "PoE budget 370 W";
    expect(capForEmbedding(short)).toBe(short);
    const long = "規格".repeat(6000); // ~12 000 chars, well over budget by the CJK count
    const capped = capForEmbedding(long);
    expect(capped.length).toBeLessThan(long.length);
    expect(estimateTokens(capped)).toBeLessThanOrEqual(EMBED_TOKEN_BUDGET);
  });
});
