import { describe, expect, it } from "vitest";
import { resolveNextVersion } from "./drive-versions";

describe("resolveNextVersion", () => {
  it("bumps from the DB when Drive is behind — the run whose upload failed", () => {
    // Run 1 numbered 1.1, saved to Storage and DB, but the Drive upload
    // failed. Drive-first numbering then read 1.0 from Drive and issued 1.1
    // AGAIN, overwriting a PDF that may already have gone to a customer.
    expect(resolveNextVersion({ drive: { major: 1, minor: 0 }, db: "1.1", mode: "new" })).toBe("1.2");
  });

  it("bumps from Drive when Drive is ahead — the run whose DB write failed", () => {
    expect(resolveNextVersion({ drive: { major: 1, minor: 3 }, db: "1.1", mode: "new" })).toBe("1.4");
  });

  it("regenerates the higher of the two, never a number below what exists", () => {
    expect(resolveNextVersion({ drive: { major: 1, minor: 3 }, db: "1.1", mode: "regenerate" })).toBe("1.3");
    expect(resolveNextVersion({ drive: null, db: "2.0", mode: "regenerate" })).toBe("2.0");
  });

  it("treats 0.0 and nothing as never generated", () => {
    expect(resolveNextVersion({ drive: null, db: "0.0", mode: "new" })).toBe("1.0");
    expect(resolveNextVersion({ drive: null, db: null, mode: "regenerate" })).toBe("1.0");
  });
});
