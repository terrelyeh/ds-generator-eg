import { describe, expect, it } from "vitest";
import { pickModel, type ModelRow } from "./models";

const row = (p: Partial<ModelRow> & { slug: string }): ModelRow =>
  ({ enabled: true, surfaces: ["ask"], default_for: [], label: p.slug, ...p }) as ModelRow;

const ROWS = [
  row({ slug: "google/gemini-3.5-flash", default_for: ["ask"] }),
  row({ slug: "anthropic/claude-opus-5" }),
  row({ slug: "openai/gpt-5", enabled: false }),
  row({ slug: "openai/gpt-5-mini", surfaces: ["translate"] }),
];

describe("pickModel", () => {
  it("returns the named model when it is enabled and offered on the surface", () => {
    expect(pickModel(ROWS, "anthropic/claude-opus-5", "ask")?.slug).toBe("anthropic/claude-opus-5");
  });

  it("falls back to the surface default for a disabled model, a model of another surface, or a stale slug", () => {
    // A disabled row used to be returned as-is: switching a model off in the
    // catalogue did nothing for anyone whose widget still sent its slug.
    expect(pickModel(ROWS, "openai/gpt-5", "ask")?.slug).toBe("google/gemini-3.5-flash");
    expect(pickModel(ROWS, "openai/gpt-5-mini", "ask")?.slug).toBe("google/gemini-3.5-flash");
    expect(pickModel(ROWS, "claude-opus", "ask")?.slug).toBe("google/gemini-3.5-flash");
  });

  it("returns null only when the surface offers nothing at all", () => {
    expect(pickModel(ROWS, null, "translate")?.slug).toBe("openai/gpt-5-mini");
    expect(pickModel([], null, "ask")).toBeNull();
  });
});
