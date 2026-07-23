/**
 * Which antenna-pattern plots a product's datasheet reserves, and what each
 * one is called.
 *
 * The slot list used to be hard-coded to Cloud AP's bands (2.4G/5G/6G × H/E)
 * behind an `isAP` flag. Broadband EOC needs two different shapes on the SAME
 * line — its dual-radio APs plot by BAND, its CPEs plot by antenna PORT — so
 * the slots are derived per product instead.
 *
 * The label doubles as the Drive/Storage file name:
 *   `{model}_{label with spaces → _}.png`
 *   e.g. ECW536_2.4G_H-plane.png, EOC600_Port1_E-plane.png
 * so changing a label orphans previously uploaded images.
 */

export interface RadioPatternSlot {
  /** Band ("2.4G") or port ("Port1") — the row grouping on the page. */
  group: string;
  /** "H-plane" | "E-plane" */
  plane: string;
  /** `${group} ${plane}` — the image_assets.label + file-name stem. */
  label: string;
}

export interface RadioPatternSource {
  category: string;
  /** products.subtitle / full_name — used to spot CPEs. */
  subtitle?: string | null;
  fullName?: string | null;
  specSections: { category: string; items: { label: string; value: string }[] }[];
}

const PLANES = ["H-plane", "E-plane"] as const;

function slotsFor(groups: string[]): RadioPatternSlot[] {
  return groups.flatMap((group) =>
    PLANES.map((plane) => ({ group, plane, label: `${group} ${plane}` })),
  );
}

/** True if any spec value matches — used to detect 6GHz / dual-radio. */
function specMatches(
  sections: RadioPatternSource["specSections"],
  labelPart: string,
  valuePattern: RegExp,
): boolean {
  return sections.some((s) =>
    s.items?.some(
      (i) =>
        i.label.toLowerCase().includes(labelPart.toLowerCase()) &&
        valuePattern.test(i.value),
    ),
  );
}

/**
 * Antenna-pattern slots for a product, or [] when its line doesn't print
 * pattern plots at all.
 *
 * - **Cloud AP** (`APs`): 2.4G + 5G, plus 6G when the Operating Frequency
 *   spec mentions it.
 * - **Broadband EOC** (`Broadband APs`): CPEs (directional client radios —
 *   the model name says "CPE") plot per antenna port; the dual-radio access
 *   points plot per band, matching the EOC series datasheet.
 */
export function radioPatternSlots(src: RadioPatternSource): RadioPatternSlot[] {
  if (src.category === "APs") {
    const has6G = specMatches(src.specSections, "operating frequency", /6\s*GHz/i);
    return slotsFor(has6G ? ["2.4G", "5G", "6G"] : ["2.4G", "5G"]);
  }

  if (src.category === "Broadband APs") {
    const name = `${src.subtitle ?? ""} ${src.fullName ?? ""}`;
    const isCpe = /\bCPE\b/i.test(name);
    return slotsFor(isCpe ? ["Port1", "Port2"] : ["2.4G", "5G"]);
  }

  return [];
}

/** True when the line prints an Antenna Patterns page at all. */
export function hasRadioPatterns(category: string): boolean {
  return category === "APs" || category === "Broadband APs";
}
