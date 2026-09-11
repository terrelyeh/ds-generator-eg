import { describe, expect, it } from "vitest";
import { normalizeOrigins } from "./origins";

const EXT = "chrome-extension://dakefbpojccpgknegbfbfeicfadbeamk";

describe("normalizeOrigins", () => {
  it("reduces web URLs to scheme + host + port", () => {
    expect(normalizeOrigins(["https://spechub.example/path?q=1", "http://localhost:3000/"])).toEqual([
      "https://spechub.example",
      "http://localhost:3000",
    ]);
  });

  it("accepts a Chrome extension origin", () => {
    // new URL() reports "null" as the origin for this scheme, so these used
    // to be dropped — and a list emptied that way disables the CSP entirely.
    expect(normalizeOrigins([EXT])).toEqual([EXT]);
    expect(normalizeOrigins([` ${EXT.toUpperCase()}/ `])).toEqual([EXT]);
    expect(normalizeOrigins([`${EXT}/panel.html`])).toEqual([EXT]);
  });

  it("drops malformed extension ids, other schemes and non-strings", () => {
    expect(
      normalizeOrigins(["chrome-extension://not-an-id", "javascript:alert(1)", "ftp://x.example", "", 42, null]),
    ).toEqual([]);
  });

  it("dedupes entries that normalise to the same origin", () => {
    expect(normalizeOrigins(["https://a.example", "https://a.example/x", EXT, `${EXT}/`])).toEqual([
      "https://a.example",
      EXT,
    ]);
  });

  it("returns an empty list for anything that isn't an array", () => {
    expect(normalizeOrigins("https://a.example")).toEqual([]);
    expect(normalizeOrigins(undefined)).toEqual([]);
  });
});
