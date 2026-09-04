import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { hashPasscode, isLegacyHash, verifyPasscode } from "./passcode";

describe("passcode hashing", () => {
  it("round-trips, salts, and rejects the wrong passcode", () => {
    const a = hashPasscode("engenius-2026");
    const b = hashPasscode("engenius-2026");
    expect(a).not.toBe(b); // a salt per hash: equal passcodes no longer share a hash
    expect(isLegacyHash(a)).toBe(false);
    expect(verifyPasscode("engenius-2026", a)).toBe(true);
    expect(verifyPasscode("engenius-2026", b)).toBe(true);
    expect(verifyPasscode("engenius-2025", a)).toBe(false);
  });

  it("still accepts a hash stored by the old sha256 code", () => {
    const legacy = createHash("sha256").update("booth-demo").digest("hex");
    expect(isLegacyHash(legacy)).toBe(true);
    expect(verifyPasscode("booth-demo", legacy)).toBe(true);
    expect(verifyPasscode("booth-demo!", legacy)).toBe(false);
  });

  it("refuses nothing, garbage, and a wrong scheme", () => {
    expect(verifyPasscode("x", null)).toBe(false);
    expect(verifyPasscode("x", "not-a-hash")).toBe(false);
    expect(verifyPasscode("x", "bcrypt$abc$def")).toBe(false);
  });
});
