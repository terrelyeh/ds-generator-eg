import { describe, expect, it } from "vitest";
import { isOpenRouterKey } from "./byok-key";

describe("isOpenRouterKey", () => {
  it("accepts an OpenRouter key, with surrounding whitespace", () => {
    expect(isOpenRouterKey(`sk-or-v1-${"a1".repeat(32)}`)).toBe(true);
    expect(isOpenRouterKey(`  sk-or-v1-${"f0".repeat(32)}\n`)).toBe(true);
  });

  it("rejects the vendor keys the old screens asked for", () => {
    // Every chat call goes to openrouter.ai; these came back 401.
    expect(isOpenRouterKey("AIzaSyD-EXAMPLEexampleEXAMPLEexample123")).toBe(false);
    expect(isOpenRouterKey("sk-ant-api03-EXAMPLEexampleEXAMPLE")).toBe(false);
    expect(isOpenRouterKey("sk-proj-EXAMPLEexampleEXAMPLEexample")).toBe(false);
  });

  it("rejects empty and truncated input", () => {
    expect(isOpenRouterKey("")).toBe(false);
    expect(isOpenRouterKey(null)).toBe(false);
    expect(isOpenRouterKey("sk-or-short")).toBe(false);
  });
});
