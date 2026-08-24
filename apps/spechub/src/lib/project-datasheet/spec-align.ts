/**
 * Two rows that are one spec under two names.
 *
 * Rows merge by `normalizeKey(label)`, so two suppliers who call the same
 * thing "Environment" and "Operating Temperature" produce TWO rows, each with
 * one column filled and the other blank. Nothing in the document says they
 * are the same thing, and the blank-cell check actively says the wrong thing
 * about them — "the others have a value, these do not, go ask the ODM" —
 * when the value is not missing at all, it is filed under the other name.
 *
 * With a catalogue model in the mix it is worse: our own labels come from
 * `spec_items` ("Physical Interfaces", "Maximum Power Consumption") and a
 * supplier's come from their PDF ("Interface", "Power Consumption"), so
 * almost nothing lines up by itself.
 *
 * ── No model here, on purpose ───────────────────────────────────────────
 * The whole gap review is deterministic: the same document must produce the
 * same list every time, and the wording that goes to an ODM has to be stable.
 * This is a pairing suggestion on a spec table, which is exactly the kind of
 * thing a table of synonyms and a handful of value shapes get right — and
 * when they are wrong, they are wrong the same way twice, which is debuggable.
 */

import { normalizeKey } from "./resolve";
import type { ResolvedRow } from "./types";

/**
 * Names for the same spec, as they actually appear in supplier sheets and in
 * our own `spec_items`. Grown from real labels, not invented.
 *
 * Doing double duty: two labels in the SAME group are a match, and two labels
 * in DIFFERENT groups are a REFUSAL — which is what stops "Power Consumption"
 * pairing with "PoE Input" just because both values end in W.
 */
const SYNONYMS: Record<string, string[]> = {
  temperature: [
    "environment", "environmental", "operating_temperature", "operating_temp",
    "temperature", "working_temperature", "ambient_temperature", "temp",
  ],
  humidity: ["humidity", "operating_humidity", "relative_humidity"],
  dimensions: [
    "dimensions", "dimension", "product_size", "size", "physical_dimensions",
    "unit_size", "product_dimensions",
  ],
  weight: ["weight", "net_weight", "product_weight", "gross_weight", "unit_weight"],
  power_draw: [
    "power_consumption", "maximum_power_consumption", "max_power_consumption",
    "power_draw", "consumption", "power_usage",
  ],
  power_in: [
    "power_source", "power_input", "power_supply", "input_power", "dc_input",
    "power", "power_over_ethernet", "poe", "poe_input",
  ],
  ingress: [
    "ip_rating", "ingress_protection", "weatherproofing", "protection_level",
    "waterproof", "ip_grade", "enclosure_rating",
  ],
  interface: [
    "interface", "interfaces", "physical_interfaces", "ports", "port",
    "connectors", "io", "ethernet", "lan_ports",
  ],
  led: ["led", "leds", "led_indicator", "led_indicators", "indicator", "indicators"],
  antenna: ["antenna", "antennas", "antenna_gain", "antenna_type", "antenna_connector"],
  wireless_standard: [
    "standards", "standard", "wireless_standard", "wifi_standard",
    "supported_standards", "radio_standard",
  ],
  certification: [
    "certification", "certifications", "regulatory", "compliance", "approvals",
    "safety", "emc",
  ],
  mounting: ["mounting", "mount", "installation", "mount_type", "mounting_options"],
  memory: ["ram", "memory", "flash", "storage", "rom"],
  processor: ["cpu", "processor", "chipset", "soc"],
  warranty: ["warranty"],
  reliability: ["mtbf", "reliability"],
};

const GROUP_OF = new Map<string, string>();
for (const [group, keys] of Object.entries(SYNONYMS)) {
  for (const k of keys) GROUP_OF.set(k, group);
}

/**
 * Shapes a VALUE can have. Deliberately narrow: each one has to be specific
 * enough that two values sharing it are very likely the same kind of fact.
 * "Contains a number" is not a shape.
 *
 * This is the half that catches the labels nobody thought to list — a
 * supplier calling it "Enclosure" still writes `-40 ~ +70 °C` in it.
 */
const SHAPES: { name: string; re: RegExp }[] = [
  { name: "temperature", re: /-?\d+\s*(?:°|deg\.?\s*)?\s*[CF]\b/ },
  { name: "dimensions", re: /\d+(?:\.\d+)?\s*[x×*]\s*\d+(?:\.\d+)?\s*[x×*]\s*\d+/i },
  { name: "weight", re: /\d+(?:\.\d+)?\s*(?:kg|kgs|g|lb|lbs)\b/i },
  { name: "watts", re: /\d+(?:\.\d+)?\s*W\b/ },
  { name: "volts", re: /\d+(?:\.\d+)?\s*V(?:DC|AC)?\b/ },
  { name: "ingress", re: /\bIP\s?[0-6][0-9K]\b/i },
  { name: "humidity", re: /\d+\s*%\s*(?:~|-|–|to)\s*\d+\s*%/ },
  { name: "poe_standard", re: /802\.3\s?(?:af|at|bt)/i },
  { name: "wifi_standard", re: /802\.11\s?[a-z]{1,2}\b/i },
];

function shapesOf(text: string): Set<string> {
  const out = new Set<string>();
  for (const s of SHAPES) if (s.re.test(text)) out.add(s.name);
  return out;
}

/** Which model columns actually carry a value in this row. */
function filled(row: ResolvedRow): Set<number> {
  const out = new Set<number>();
  row.cells.forEach((c, i) => {
    if (!c.isBlank && c.value.trim()) out.add(i);
  });
  return out;
}

export interface SplitSpec {
  /** the row that survives the merge */
  into: ResolvedRow;
  /** the row folded into it */
  from: ResolvedRow;
  /** column indexes whose value moves */
  columns: number[];
  /** what made us pair them, for the finding's wording */
  because: string;
}

/**
 * Rows that look like one spec split across two names.
 *
 * The complementary test does most of the work and is the reason this can be
 * offered as an action rather than a hint: if any column has a value in BOTH
 * rows they are two different specs, whatever they are called, and merging
 * would destroy one of them.
 */
export function findSplitSpecs(rows: ResolvedRow[], preferInto?: (row: ResolvedRow) => boolean): SplitSpec[] {
  const out: SplitSpec[] = [];

  for (let a = 0; a < rows.length; a++) {
    for (let b = a + 1; b < rows.length; b++) {
      const A = rows[a];
      const B = rows[b];
      if (A.group !== B.group) continue;

      const fa = filled(A);
      const fb = filled(B);
      if (fa.size === 0 || fb.size === 0) continue;
      // Overlap means both models have both rows — two real specs.
      if ([...fa].some((i) => fb.has(i))) continue;

      const ka = normalizeKey(A.label);
      const kb = normalizeKey(B.label);
      const ga = GROUP_OF.get(ka);
      const gb = GROUP_OF.get(kb);

      // Both named, and named as different things. Refuse before the value
      // shapes get a chance to pair Power Consumption with PoE Input.
      if (ga && gb && ga !== gb) continue;

      const sameName = !!ga && ga === gb;
      const textA = A.cells.map((c) => c.value).join(" ");
      const textB = B.cells.map((c) => c.value).join(" ");
      const shared = [...shapesOf(textA)].filter((s) => shapesOf(textB).has(s));

      if (!sameName && shared.length === 0) continue;

      const because = sameName
        ? `「${A.label}」和「${B.label}」通常指同一件事`
        : `兩邊的值都是同一種東西（${SHAPE_LABEL[shared[0]] ?? shared[0]}）`;

      /**
       * Which label survives.
       *
       * A catalogue model's label wins outright: it is our own published
       * wording, and it is what the customer can hold the public datasheet
       * up against.
       *
       * Otherwise the FIRST COLUMN's wording wins — not the row sitting
       * higher, which was the first attempt and got it backwards. Row order
       * merges each column's own sequence, so a second supplier's unique
       * rows land ABOVE the first supplier's; "higher" therefore means
       * "belongs to whoever was added last", the opposite of the document's
       * established vocabulary.
       */
      const catA = !!preferInto && preferInto(A);
      const catB = !!preferInto && preferInto(B);
      const firstCol = (set: Set<number>) => Math.min(...set);
      const bWins = catA !== catB ? catB : firstCol(fb) < firstCol(fa);
      const into = bWins ? B : A;
      const from = bWins ? A : B;
      out.push({ into, from, columns: [...filled(from)], because });
      if (out.length === 8) return out;
    }
  }
  return out;
}

const SHAPE_LABEL: Record<string, string> = {
  temperature: "溫度",
  dimensions: "尺寸",
  weight: "重量",
  watts: "瓦數",
  volts: "電壓",
  ingress: "防護等級",
  humidity: "濕度",
  poe_standard: "PoE 等級",
  wifi_standard: "Wi-Fi 標準",
};
