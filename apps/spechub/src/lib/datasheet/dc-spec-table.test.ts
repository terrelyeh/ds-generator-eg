import { describe, expect, it } from "vitest";
import {
  buildDcSpecBlocks,
  estimateDcBlockHeight,
  paginateDcSpecBlocks,
  withStripes,
  type DcSpecBlock,
} from "./dc-spec-table";

const item = (label: string, value: string, sort_order: number) => ({ label, value, sort_order });

/**
 * SE110 the way the parser stores it: rows under the sheet's "Technical
 * Specifications" row land in "General", and the PM's second header row
 * becomes a named section. Deliberately out of order — sort_order decides.
 */
const SE110 = [
  {
    category: "High-Performance AI & Graphics Acceleration",
    sort_order: 1,
    spec_items: [
      item("LLM Workload Capacity", "Up to 10B parameters", 1),
      item("Supports expansion with up to", "1 x NVIDIA RTX Pro 4500 SE GPU", 0),
    ],
  },
  {
    category: "General",
    sort_order: 0,
    spec_items: [item("Form Factor", "1U Rackmount", 0), item("Socket Type", "BGA", 1)],
  },
];

const IDENTITY = [
  { label: "Model Name", value: "1U Edge Server" },
  { label: "Model Number", value: "SE110" },
];

const labels = (blocks: DcSpecBlock[]) =>
  blocks.map((b) => (b.kind === "section" ? `[${b.title}]` : b.label));

describe("buildDcSpecBlocks", () => {
  it("bands every group, General included — the rule layout A follows", () => {
    expect(buildDcSpecBlocks(SE110)).toEqual([
      { kind: "section", title: "General" },
      { kind: "row", label: "Form Factor", value: "1U Rackmount" },
      { kind: "row", label: "Socket Type", value: "BGA" },
      { kind: "section", title: "High-Performance AI & Graphics Acceleration" },
      { kind: "row", label: "Supports expansion with up to", value: "1 x NVIDIA RTX Pro 4500 SE GPU" },
      { kind: "row", label: "LLM Workload Capacity", value: "Up to 10B parameters" },
    ]);
  });

  it("opens the first group with Model Name and Model Number", () => {
    expect(labels(buildDcSpecBlocks(SE110, IDENTITY))).toEqual([
      "[General]",
      "Model Name",
      "Model Number",
      "Form Factor",
      "Socket Type",
      "[High-Performance AI & Graphics Acceleration]",
      "Supports expansion with up to",
      "LLM Workload Capacity",
    ]);
  });

  it("prints no band over a group whose every value is blank or N/A", () => {
    const blocks = buildDcSpecBlocks([
      { category: "General", sort_order: 0, spec_items: [item("Form Factor", "1U Rackmount", 0)] },
      { category: "Compliance", sort_order: 1, spec_items: [item("EMC", "N/A", 0), item("Safety", "  ", 1)] },
    ]);
    expect(labels(blocks)).toEqual(["[General]", "Form Factor"]);
  });

  it("hands the identity rows to the first group that prints, not to an empty one", () => {
    const blocks = buildDcSpecBlocks(
      [
        { category: "General", sort_order: 0, spec_items: [item("PCH Chipset", "", 0)] },
        { category: "Processor & Memory", sort_order: 1, spec_items: [item("Socket Type", "BGA", 0)] },
      ],
      IDENTITY,
    );
    expect(labels(blocks)).toEqual(["[Processor & Memory]", "Model Name", "Model Number", "Socket Type"]);
  });

  it("prints no table at all when no group has a printable row", () => {
    // The Generate gate reads an empty result as "no specs"; two identity
    // rows on their own must not look like a spec sheet to it.
    expect(buildDcSpecBlocks([{ category: "General", sort_order: 0, spec_items: [] }], IDENTITY)).toEqual([]);
  });
});

describe("estimateDcBlockHeight", () => {
  it("gives a 261-character value the 3 lines it prints on", () => {
    // SE110/SE210's Target Workloads. At 86 characters a line it was
    // estimated at 4, and that phantom line moved SE210's whole AI group
    // onto a page of its own.
    const oneLine = estimateDcBlockHeight({ kind: "row", label: "Target Workloads", value: "x" });
    const long = estimateDcBlockHeight({ kind: "row", label: "Target Workloads", value: "x".repeat(261) });
    expect(long).toBe(oneLine + 2 * 11);
  });
});

describe("paginateDcSpecBlocks", () => {
  const row = (label: string): DcSpecBlock => ({ kind: "row", label, value: "x" });
  const band = (title: string): DcSpecBlock => ({ kind: "section", title });
  const names = (pages: DcSpecBlock[][]) => pages.map(labels);
  const THREE = estimateDcBlockHeight(row("a")) * 3;

  it("never leaves a band as the last thing on a page", () => {
    // Room for exactly three one-line blocks. The band alone would fit as the
    // third, but its first row would not — so the band has to move with it.
    const pages = paginateDcSpecBlocks([row("1"), row("2"), band("AI"), row("3")], THREE, THREE);
    expect(names(pages)).toEqual([["1", "2"], ["[AI]", "3"]]);
  });

  it("keeps a band on the page when its first row fits after it", () => {
    const pages = paginateDcSpecBlocks([row("1"), band("AI"), row("2")], THREE, THREE);
    expect(names(pages)).toEqual([["1", "[AI]", "2"]]);
  });

  it("moves a short section to the next page whole rather than split it", () => {
    // S41's shape: the band and its first row would fit, the whole section
    // would not. Split, the last rows sit on the next page with no band.
    const FOUR = estimateDcBlockHeight(row("a")) * 4;
    const pages = paginateDcSpecBlocks([row("1"), row("2"), band("AI"), row("3"), row("4")], FOUR, FOUR);
    expect(names(pages)).toEqual([["1", "2"], ["[AI]", "3", "4"]]);
  });

  it("starts a section longer than a page where its band and first row fit", () => {
    const pages = paginateDcSpecBlocks(
      [row("1"), band("AI"), row("2"), row("3"), row("4"), row("5")],
      THREE,
      THREE,
    );
    expect(names(pages)).toEqual([["1", "[AI]", "2"], ["3", "4", "5"]]);
  });
});

describe("withStripes", () => {
  it("restarts the zebra under every band", () => {
    // An odd number of rows above the band, so a stripe that merely kept
    // counting would come out the other way round beneath it.
    const page = withStripes([
      { kind: "row", label: "a", value: "x" },
      { kind: "row", label: "b", value: "x" },
      { kind: "row", label: "c", value: "x" },
      { kind: "section", title: "AI" },
      { kind: "row", label: "d", value: "x" },
      { kind: "row", label: "e", value: "x" },
    ]);
    expect(page.map((b) => b.alt)).toEqual([false, true, false, false, false, true]);
  });
});
