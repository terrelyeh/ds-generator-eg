import { describe, expect, it } from "vitest";
import { parseScenarios } from "./scenarios";

const REPLY = JSON.stringify({
  scenarios: [
    {
      heading: "Quayside crane",
      lede: "The outdoor unit rides the crane arm.",
      bullets: [
        { text: "Rated -40 to 70 °C.", basis: "Environment (EOR200)" },
        { text: "A second carrier stands by when one degrades.", basis: "Dual-SIM Failover" },
        { text: "Cable runs are the yard's to plan.", basis: "" },
      ],
    },
  ],
  declined: [],
});

describe("parseScenarios with the spec table's labels", () => {
  it("blanks a basis that names no row and reports it, keeping the bullet", () => {
    const out = parseScenarios(REPLY, ["Environment", "WAN Ports"]);
    const bullets = out.scenarios[0].bullets;
    expect(bullets).toHaveLength(3);
    expect(bullets.map((b) => b.basis)).toEqual(["Environment (EOR200)", "", ""]);
    expect(out.unverifiedBasis).toEqual(["Dual-SIM Failover"]);
  });
});
