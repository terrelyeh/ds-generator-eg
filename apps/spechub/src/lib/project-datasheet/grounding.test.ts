import { describe, expect, it } from "vitest";
import { basisMatches, groundBullets } from "./grounding";

const LABELS = ["Operating Temperature", "Environment", "WAN Ports", "Storage Temperature"];

describe("basisMatches", () => {
  it("accepts the label verbatim, and with the model parenthetical the contract allows", () => {
    expect(basisMatches("Operating Temperature", LABELS)).toBe(true);
    expect(basisMatches("Environment (EOR200)", LABELS)).toBe(true);
    expect(basisMatches("environment  (EOR100, EOR200)", LABELS)).toBe(true);
  });

  it("rejects a row that is not in the table, however plausible", () => {
    // The one this exists for: a sentence about automatic failover resting on
    // a row called "Dual-SIM Failover" that the supplier never wrote.
    expect(basisMatches("Dual-SIM Failover", LABELS)).toBe(false);
    expect(basisMatches("Operating Temp", LABELS)).toBe(false);
    expect(basisMatches("", LABELS)).toBe(false);
  });
});

describe("groundBullets", () => {
  it("keeps every bullet, blanks the invented basis, and names it", () => {
    const { bullets, unverified } = groundBullets(
      [
        { text: "Rated for -40 to 70 °C.", basis: "Operating Temperature" },
        { text: "A second carrier stands by when one degrades.", basis: "Dual-SIM Failover" },
        { text: "Trenching typically takes a week.", basis: "" },
      ],
      LABELS,
    );
    expect(bullets.map((b) => b.basis)).toEqual(["Operating Temperature", "", ""]);
    expect(bullets).toHaveLength(3);
    expect(unverified).toEqual(["Dual-SIM Failover"]);
  });
});
