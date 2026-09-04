import { describe, expect, it, vi } from "vitest";
import { allowedKnowledgeAreas } from "./workspaces";
import type { AskWorkspace } from "./workspaces";

const ws = (over: Partial<AskWorkspace>): AskWorkspace =>
  ({ slug: "test", passcode_hash: null, scope: {}, ...over }) as AskWorkspace;

describe("allowedKnowledgeAreas", () => {
  it("gives a passcode-protected workspace everything it is configured with", () => {
    expect(
      allowedKnowledgeAreas(
        ws({ passcode_hash: "abc", scope: { knowledge_areas: ["marketing", "company"] } }),
      ),
    ).toEqual(["marketing", "company"]);
  });

  it("includes a workspace scoped directly at an area", () => {
    expect(
      allowedKnowledgeAreas(ws({ passcode_hash: "abc", scope: { solution: "onboarding" } })),
    ).toEqual(["onboarding"]);
  });

  it("withholds private areas from a workspace anyone can open", () => {
    // /ask/mkt and /ask/sales are guessable and had no passcode, so this is
    // the difference between department SOPs being internal and being public.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      allowedKnowledgeAreas(ws({ slug: "mkt", scope: { knowledge_areas: ["marketing", "company"] } })),
    ).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("says nothing about a passcode-less workspace that had no private areas", () => {
    // spechub and demo-widget: open on purpose, product scope only.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(allowedKnowledgeAreas(ws({ slug: "spechub", scope: {} }))).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
