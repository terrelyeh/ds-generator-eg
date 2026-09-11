import { describe, expect, it } from "vitest";
import { workspaceShareText } from "./share-info";

describe("workspaceShareText", () => {
  it("includes the passcode when there is one", () => {
    expect(workspaceShareText({ name: "業務部", url: "https://engenie-eg.vercel.app/ask/sales", passcode: "7f3k9q" })).toBe(
      "EnGenie — 業務部\n網址：https://engenie-eg.vercel.app/ask/sales\nPasscode：7f3k9q",
    );
  });

  it("leaves the passcode line out when there isn't one to give", () => {
    expect(workspaceShareText({ name: "SpecHub", url: "https://x/ask/spechub", passcode: null })).toBe(
      "EnGenie — SpecHub\n網址：https://x/ask/spechub",
    );
  });
});
