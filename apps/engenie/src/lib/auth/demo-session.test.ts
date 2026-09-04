import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_TTL_MS, computeDemoToken, isValidDemoToken } from "./demo-session";

describe("demo session token", () => {
  beforeEach(() => {
    process.env.DEMO_ACCESS_KEY = "test-passcode";
  });

  it("accepts a token it just issued", async () => {
    const t = await computeDemoToken();
    expect(t).toBeTruthy();
    expect(await isValidDemoToken(t)).toBe(true);
  });

  it("refuses a token past its lifetime", async () => {
    // The old token was an HMAC of a fixed string, so this case could not
    // even be expressed: every token was valid for ever.
    const issued = Date.now() - DEMO_TTL_MS - 1000;
    const t = await computeDemoToken(issued);
    expect(await isValidDemoToken(t)).toBe(false);
  });

  it("still accepts one just inside the window", async () => {
    const issued = Date.now() - (DEMO_TTL_MS - 60_000);
    expect(await isValidDemoToken(await computeDemoToken(issued))).toBe(true);
  });

  it("refuses a tampered timestamp, since the signature covers it", async () => {
    const t = (await computeDemoToken(Date.now() - DEMO_TTL_MS - 1000))!;
    const forged = `${Date.now()}.${t.split(".")[1]}`;
    expect(await isValidDemoToken(forged)).toBe(false);
  });

  it("refuses junk, empty values and a token minted under another key", async () => {
    expect(await isValidDemoToken(undefined)).toBe(false);
    expect(await isValidDemoToken("")).toBe(false);
    expect(await isValidDemoToken("nodot")).toBe(false);
    expect(await isValidDemoToken(".abc")).toBe(false);
    const t = await computeDemoToken();
    process.env.DEMO_ACCESS_KEY = "a-different-passcode";
    expect(await isValidDemoToken(t)).toBe(false);
  });
});
