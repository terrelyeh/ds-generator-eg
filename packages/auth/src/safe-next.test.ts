import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("keeps ordinary in-app paths", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/product/ECW536?tab=specs")).toBe("/product/ECW536?tab=specs");
    expect(safeNextPath("/")).toBe("/");
  });

  it("rejects protocol-relative and backslash authorities", () => {
    // Both of these pass a naive startsWith("/") check and both leave the site.
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("//evil.example/dashboard")).toBe("/");
  });

  it("rejects absolute URLs and anything not rooted at /", () => {
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
    expect(safeNextPath("dashboard")).toBe("/");
  });

  it("falls back for empty input", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath(null, "/ask")).toBe("/ask");
  });
});
