import { describe, expect, it } from "vitest";
import { formatPlainText, type ChangeEntry, type SyncWarning } from "./index";

const warning: SyncWarning = {
  product_line: "Cloud VPN Firewall",
  product_name: "ESG320",
  message: "規格表有重複分類：「Compliance」出現 2 次",
};
const change: ChangeEntry = {
  product_name: "ECW536",
  product_line: "Cloud AP",
  changes_summary: "1 spec modified",
  edited_by: null,
  edited_at: null,
};

describe("formatPlainText", () => {
  it("lists sheet warnings first, even when nothing changed", () => {
    const text = formatPlainText([], [warning]);
    expect(text).toContain("⚠️ 請檢查 Sheet");
    expect(text).toContain("Cloud VPN Firewall / ESG320 — 規格表有重複分類：「Compliance」出現 2 次");
    // No "0 product(s) updated" line on a warnings-only report.
    expect(text).not.toContain("Total:");
  });

  it("puts warnings above the change list", () => {
    const text = formatPlainText([change], [warning]);
    const warningAt = text.indexOf("⚠️ 請檢查 Sheet");
    expect(warningAt).toBeGreaterThan(-1);
    expect(warningAt).toBeLessThan(text.indexOf("【Cloud AP】"));
    expect(text).toContain("Total: 1 product(s) updated");
  });

  it("is unchanged when there are no warnings", () => {
    const text = formatPlainText([change]);
    expect(text).not.toContain("請檢查 Sheet");
    expect(text).toContain("• ECW536 — 1 spec modified");
  });
});
