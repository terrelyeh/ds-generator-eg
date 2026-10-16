/**
 * What changed between a product's stored spec table and the sheet's.
 *
 * Sync only rewrites a product's specs when this returns something (the
 * "no changes → skip" path keeps quiet days from spamming change logs and
 * Telegram). So anything this can't see, sync can't fix.
 *
 * The per-section diff keys sections by category and items by label. That
 * reads well in a change log, but a map can't tell one "Compliance" from
 * two: on 2026-10-16 a PM briefly duplicated the Compliance block on the
 * VPN Firewall sheet, a sync stored it twice for all four ESG models, and
 * after the sheet was put back every later sync — forced or not — collapsed
 * the two stored copies into one, found it equal to the sheet, and left the
 * duplicate printing in the PDFs. The ordered comparison at the end catches
 * that, and anything else the maps hide: reordered sections or rows, a
 * repeated label.
 */

export interface SpecSectionLike {
  category: string;
  items: { label: string; value: string }[];
}

export interface SpecChange {
  field: string;
  from: string | null;
  to: string | null;
  type: "added" | "removed" | "modified";
}

export function diffSpecTables(oldSections: SpecSectionLike[], newSections: SpecSectionLike[]): SpecChange[] {
  const details: SpecChange[] = [];
  const toMap = (sections: SpecSectionLike[]) => {
    const map = new Map<string, Map<string, string>>();
    for (const s of sections) map.set(s.category, new Map(s.items.map((i) => [i.label, i.value])));
    return map;
  };
  const oldMap = toMap(oldSections);
  const newMap = toMap(newSections);

  for (const cat of newMap.keys()) {
    if (!oldMap.has(cat)) details.push({ field: `Section: ${cat}`, from: null, to: "(new section)", type: "added" });
  }
  for (const cat of oldMap.keys()) {
    if (!newMap.has(cat)) details.push({ field: `Section: ${cat}`, from: "(removed)", to: null, type: "removed" });
  }
  for (const [cat, newItems] of newMap) {
    const oldItems = oldMap.get(cat);
    if (!oldItems) continue;
    for (const [label, newVal] of newItems) {
      const oldVal = oldItems.get(label);
      if (oldVal === undefined) details.push({ field: `${cat} > ${label}`, from: null, to: newVal, type: "added" });
      else if (oldVal !== newVal) details.push({ field: `${cat} > ${label}`, from: oldVal, to: newVal, type: "modified" });
    }
    for (const [label, oldVal] of oldItems) {
      if (!newItems.has(label)) details.push({ field: `${cat} > ${label}`, from: oldVal, to: null, type: "removed" });
    }
  }

  if (details.length === 0 && signature(oldSections) !== signature(newSections)) {
    details.push({
      field: "Spec table layout",
      from: outline(oldSections),
      to: outline(newSections),
      type: "modified",
    });
  }
  return details;
}

function signature(sections: SpecSectionLike[]): string {
  return JSON.stringify(sections.map((s) => [s.category, s.items.map((i) => [i.label, i.value])]));
}

/** Section names in order, with row counts — enough to see a duplicate or a move. */
function outline(sections: SpecSectionLike[]): string {
  return sections.map((s) => `${s.category} (${s.items.length})`).join(" · ");
}
