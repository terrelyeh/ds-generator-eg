import { describe, expect, it } from "vitest";
import { parseFeatureGroups } from "./sheets-extra";

describe("parseFeatureGroups", () => {
  it("starts a group at a 'Chip | Title' line even without the trailing colon", () => {
    // SE110's real cell (2026-10-28): only some titles end with ":". The
    // others used to be glued onto the previous bullet, so the cover showed
    // three groups and one of them carried six bullets.
    const cell = [
      "GPU | 1 x NVIDIA RTX PRO™ 4500 SE",
      " - Inference — FP16: up to 9B / FP8: up to 19B / NVFP4: up to 37B",
      " - Fine-Tuning — LoRA: up to 10B / QLoRA: up to 24B / Full-Param: up to 2B",
      "",
      "Performance | Latest E-core Atom processor",
      "- Intel® Atom® SoC Grand Ridge with up to 24 cores delivers power-efficient performance for edge workloads.",
      "",
      "Memory | DDR5 ECC SO-DIMM",
      "- 2 x DDR5 SO-DIMM slots with ECC keep edge services stable under sustained load.",
      "",
      "Security | Hardware Root of Trust:",
      "- TPM 2.0 with optional PFR 2.0 safeguards firmware integrity from power-on through runtime.",
      "",
      "Deployment | Compact Short-Depth Design",
      "- 310mm depth 1U chassis with 5 smart fans and one 700W 80 Plus Platinum PSU",
    ].join("\n");

    const groups = parseFeatureGroups(cell);
    expect(groups.map((g) => g.title)).toEqual([
      "GPU | 1 x NVIDIA RTX PRO™ 4500 SE",
      "Performance | Latest E-core Atom processor",
      "Memory | DDR5 ECC SO-DIMM",
      "Security | Hardware Root of Trust",
      "Deployment | Compact Short-Depth Design",
    ]);
    expect(groups.map((g) => g.bullets.length)).toEqual([2, 1, 1, 1, 1]);
  });

  it("starts a group at a plain line after a blank line", () => {
    const groups = parseFeatureGroups("Cooling:\n- Smart fans\n\nRedundant Power\n- Two PSUs");
    expect(groups.map((g) => g.title)).toEqual(["Cooling", "Redundant Power"]);
  });

  it("still joins a soft-wrapped bullet onto the line above", () => {
    const groups = parseFeatureGroups("Memory:\n- 16 channels DDR5\nup to 4TB\r\n- ECC");
    expect(groups).toEqual([{ title: "Memory", bullets: ["16 channels DDR5 up to 4TB", "ECC"] }]);
  });
});
