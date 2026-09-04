import { describe, expect, it } from "vitest";
import { findingId, scanDocument, storedFindingId, type ScanInput } from "./gap-scan";

/**
 * The scanner's whole judgement is the blocking/advisory line, and the two
 * things that move it: whether a value has a source, and where the column
 * came from. Everything here is about that, because "how many findings" is
 * not what the feature is for.
 */
const doc = (over: Partial<ScanInput["doc"]> = {}): ScanInput["doc"] => ({
  id: "d1",
  name: "Tender A",
  customer: "City of X",
  overview: "An outdoor unit.",
  headline: "Rugged edge router",
  series_name: "EOR",
  category_label: "Router",
  footnote: null,
  features: [{ title: "Built for outdoors", bullets: ["-40 to 70 °C"] }],
  doc_rules: {},
  sections: {},
  ...over,
});

const row = (key: string, label: string, values: (string | null)[]) => ({
  key,
  label,
  group: "spec",
  cells: values.map((v) => ({
    value: v ?? "TBD",
    origin: "source" as never,
    isBlank: v === null,
  })),
});

/** `asRawDoc` drops any row without a label, so the fixture must carry one. */
const src = (key: string, label: string, value: string) => ({ key, label, value, group: "spec" });

function scan(input: {
  raw: ReturnType<typeof src>[];
  override: Record<string, string>;
  rows: ReturnType<typeof row>[];
  fromCatalog?: boolean;
}) {
  const model = {
    id: "m1",
    model_name: "EOR200",
    display_name: null,
    overview: null,
    images: [],
    raw_doc: input.raw,
    rules: { override: input.override },
  };
  return scanDocument({
    doc: doc(),
    models: [model],
    rows: input.rows,
    catalogModels: input.fromCatalog ? new Set(["m1"]) : undefined,
  } as ScanInput);
}

describe("what blocks a document", () => {
  it("does not block on blanks, however many", () => {
    // "Incompleteness never blocks — TBD is honest in a preliminary sheet."
    // Fourteen unfilled cells are a document that is not finished, not a
    // document that is wrong.
    const rows = Array.from({ length: 14 }, (_, i) => row(`k${i}`, `Spec ${i}`, [null]));
    const findings = scan({ raw: [], override: {}, rows });
    expect(findings.filter((f) => f.severity === "blocking")).toEqual([]);
  });

  it("blocks on one value the supplier never stated", () => {
    // The other half of the same rule: a single unsourced IP rating is a
    // promise printed in a customer's hand.
    const findings = scan({
      raw: [src("temp", "Operating Temperature", "-40 to 70 °C")],
      override: { ingress: "IP67" },
      rows: [row("temp", "Operating Temperature", ["-40 to 70 °C"]), row("ingress", "Ingress", ["IP67"])],
    });
    const blocking = findings.filter((f) => f.severity === "blocking");
    expect(blocking).toHaveLength(1);
    expect(blocking[0].code).toBe("unsourced_value");
    expect(blocking[0].rowKey).toBe("ingress");
  });
});

describe("where the column came from flips the verdict", () => {
  const args = {
    raw: [src("temp", "Operating Temperature", "-40 to 70 °C")],
    override: { ingress: "IP67" },
    rows: [row("temp", "Operating Temperature", ["-40 to 70 °C"]), row("ingress", "Ingress", ["IP67"])],
  };

  it("adding a spec is blocking for an ODM column and advisory for one of ours", () => {
    // Same edit, opposite reading. On a sourcing model we are asking the
    // vendor to build something new; on our own model we are documenting
    // what the public sheet omits, which is the point of the feature.
    expect(scan(args).find((f) => f.rowKey === "ingress")?.severity).toBe("blocking");
    const ours = scan({ ...args, fromCatalog: true }).find((f) => f.rowKey === "ingress");
    expect(ours?.severity).toBe("advisory");
    expect(ours?.code).toBe("catalog_added_spec");
  });

  it("changing a value our public datasheet states is the sharpest finding there is", () => {
    // The customer can put this PDF beside the datasheet on our website.
    const findings = scan({
      raw: [src("temp", "Operating Temperature", "-20 to 50 °C")],
      override: { temp: "-40 to 70 °C" },
      rows: [row("temp", "Operating Temperature", ["-40 to 70 °C"])],
      fromCatalog: true,
    });
    const deviation = findings.find((f) => f.code === "catalog_deviation");
    expect(deviation?.severity).toBe("blocking");
    expect(deviation?.modelId).toBe("m1");
  });

  it("says nothing when the override matches the source", () => {
    const findings = scan({
      raw: [src("temp", "Operating Temperature", "-40 to 70 °C")],
      override: { temp: "-40 to 70 °C" },
      rows: [row("temp", "Operating Temperature", ["-40 to 70 °C"])],
    });
    expect(findings.filter((f) => f.rowKey === "temp")).toEqual([]);
  });
});

describe("finding identity", () => {
  it("survives a rescan, and matches what the stored row computes", () => {
    // Answers are keyed on this. If it moved, every answered question would
    // reappear as open the next time the document was scanned.
    const f = { code: "unsourced_value", modelId: "m1", rowKey: "ingress" };
    expect(findingId(f)).toBe("unsourced_value|m1|ingress");
    expect(storedFindingId({ code: "unsourced_value", model_id: "m1", row_key: "ingress" })).toBe(
      findingId(f),
    );
    // Document-level findings have no model or row, and still get one id.
    expect(findingId({ code: "no_customer", modelId: null, rowKey: null })).toBe("no_customer||");
  });
});
