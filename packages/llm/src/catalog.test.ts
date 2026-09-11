import { describe, expect, it } from "vitest";
import { suggestSlugs } from "./catalog";

const IDS = [
  "~deepseek/deepseek-v4-flash-latest",
  "deepseek/deepseek-v4-flash-0731",
  "deepseek/deepseek-v4-flash",
  "anthropic/claude-sonnet-4",
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-sonnet-5",
  "anthropic/claude-haiku-4.5",
  "openai/gpt-5.5",
  "openai/gpt-5.5:batch",
  "google/gemini-3.5-flash",
];

describe("suggestSlugs", () => {
  it("offers the ~ alias when an always-latest id is written without it", () => {
    expect(suggestSlugs("deepseek/deepseek-v4-flash-latest", IDS)).toEqual(["~deepseek/deepseek-v4-flash-latest"]);
  });

  it("drops a ~ that a pinned id doesn't have", () => {
    expect(suggestSlugs("~anthropic/claude-sonnet-4.6", IDS)).toEqual(["anthropic/claude-sonnet-4.6"]);
  });

  it("offers the nearest ids for a typo — in the model or in the vendor", () => {
    expect(suggestSlugs("anthropic/claude-sonnet-46", IDS)[0]).toBe("anthropic/claude-sonnet-4.6");
    expect(suggestSlugs("antropic/claude-haiku-4.5", IDS)[0]).toBe("anthropic/claude-haiku-4.5");
    expect(suggestSlugs("openai/gpt55", IDS)[0]).toBe("openai/gpt-5.5");
  });

  it("never offers a :batch id", () => {
    expect(suggestSlugs("openai/gpt-5.5x", IDS)).toEqual(["openai/gpt-5.5"]);
  });

  it("returns nothing rather than a far-fetched guess", () => {
    expect(suggestSlugs("foo/bar", IDS)).toEqual([]);
  });
});
