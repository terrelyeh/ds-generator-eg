/**
 * raw_doc ⊕ rules → the spec matrix that actually prints.
 *
 * Nothing here is stored. The final table is recomputed on every render, so
 * re-extracting a source (better model, ODM shipped V1.1) replaces `raw_doc`
 * without touching a single human edit. That is the whole reason the two are
 * separate columns; see migration 00038.
 *
 * Rules are keyed by `normalizeKey(label)` — stable because the label comes
 * off a fixed source document. A re-extract that renames or drops a label
 * leaves an ORPHANED rule, which `findOrphanedRules` surfaces rather than
 * discarding: an override that silently stops applying is how a tender
 * document goes out with the chipset back in it.
 */

import type {
  AddedRow,
  BlankMode,
  DocRules,
  RawSpecRow,
  ResolvedCell,
  ResolvedRow,
  SpecRules,
} from "./types";

/** Placeholder printed for each blank mode. */
const BLANK_TEXT: Record<BlankMode, string> = {
  tbd: "TBD",
  na: "—",
  blank: "",
};

/**
 * Label → rule key. Case and punctuation are noise ("4G&3G Frequency Bands"
 * and "4G & 3G frequency bands" are the same row), so they're stripped.
 */
export function normalizeKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Coerce whatever came out of jsonb into a rule set. */
export function asRules(value: unknown): SpecRules {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as SpecRules;
}

/** Coerce whatever came out of jsonb into raw rows, dropping malformed ones. */
export function asRawDoc(value: unknown): RawSpecRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((r) => {
    if (!r || typeof r !== "object") return [];
    const row = r as Partial<RawSpecRow>;
    if (typeof row.label !== "string" || !row.label.trim()) return [];
    return [
      {
        key: row.key?.trim() || normalizeKey(row.label),
        label: row.label,
        value: typeof row.value === "string" ? row.value : "",
        source_page: row.source_page ?? null,
        confidence: row.confidence ?? null,
        group: row.group?.trim() || "spec",
      },
    ];
  });
}

/**
 * Merge document rules with one model's. The model wins on conflict — a
 * per-column decision is more specific than a document-wide one.
 *
 * `hide` is the exception: it UNIONS rather than overrides. "Don't print the
 * chipset" is a statement about the document, and letting a column re-enable
 * a row the document suppressed would defeat the reason doc-level rules
 * exist at all.
 *
 * `add` is model-only: a new row needs a value for the column it appears in.
 * Wanting the same new row on every model already has a spelling — a
 * doc-level `key = value` invents the row wherever it is missing — so this
 * drops rather than supports a second way to say it. The editor warns when a
 * doc-level rule set carries `add`, because a silently ignored rule is
 * exactly the failure this module exists to prevent.
 */
export function mergeRules(doc: DocRules, model: SpecRules): SpecRules {
  return {
    hide: [...new Set([...(doc.hide ?? []), ...(model.hide ?? [])])],
    override: { ...(doc.override ?? {}), ...(model.override ?? {}) },
    rename: { ...(doc.rename ?? {}), ...(model.rename ?? {}) },
    blank: { ...(doc.blank ?? {}), ...(model.blank ?? {}) },
    add: model.add ?? [],
  };
}

/** One column's rows after its own rules are applied. */
type Column = Map<string, ResolvedCell & { label: string; group: string }>;

function resolveColumn(raw: RawSpecRow[], rules: SpecRules): Column {
  const hidden = new Set(rules.hide ?? []);
  const out: Column = new Map();

  const put = (key: string, label: string, group: string, cell: ResolvedCell) => {
    if (hidden.has(key)) return;
    out.set(key, { ...cell, label: rules.rename?.[key] ?? label, group });
  };

  for (const row of raw) {
    const overridden = rules.override?.[row.key];
    put(row.key, row.label, row.group ?? "spec", {
      value: overridden ?? row.value,
      origin: overridden === undefined ? "source" : "override",
      isBlank: false,
      sourcePage: row.source_page ?? null,
    });
  }

  // Added rows land after `add`, so an override written against an added key
  // still applies — the sales note "PoE is 802.3af/at" and a later correction
  // to it are the same kind of edit and shouldn't behave differently.
  for (const add of rules.add ?? []) {
    const key = add.key || normalizeKey(add.label);
    const overridden = rules.override?.[key];
    put(key, add.label, add.group ?? "spec", {
      value: overridden ?? add.value,
      origin: "added",
      isBlank: false,
      sourcePage: null,
    });
  }

  // An override against a key no source row carries still prints. Sales say
  // "it's IP67" about a source that never mentioned ingress protection, and
  // dropping that on the floor would be the worst possible failure mode.
  for (const [key, value] of Object.entries(rules.override ?? {})) {
    if (out.has(key) || hidden.has(key)) continue;
    put(key, rules.rename?.[key] ?? humanizeKey(key), "spec", {
      value,
      origin: "override",
      isBlank: false,
      sourcePage: null,
    });
  }

  // Honour `add.after`. Added rows are appended above so an override written
  // against an added key still finds it; placing them is a separate pass.
  const positioned = placeAdds(out, rules.add ?? []);

  // A row whose value resolved to nothing is blank, not empty.
  for (const [key, cell] of positioned) {
    if (cell.value.trim()) continue;
    const mode = rules.blank?.[key];
    positioned.set(key, {
      ...cell,
      value: mode ? BLANK_TEXT[mode] : "",
      origin: "blank",
      isBlank: true,
    });
  }

  return positioned;
}

/**
 * Move each added row to sit just after the row it names. Map iteration is
 * insertion-ordered, so "position" here means rebuilding the map.
 *
 * An `after` naming a row that isn't there (hidden, or never in the source)
 * leaves the addition where it landed rather than dropping it — losing a row
 * because its neighbour was hidden would be a surprising way to lose content.
 */
function placeAdds(out: Column, adds: AddedRow[]): Column {
  if (adds.length === 0) return out;
  const entries = [...out.entries()];
  for (const add of adds) {
    if (!add.after && !add.first) continue;
    const key = add.key || normalizeKey(add.label);
    const from = entries.findIndex(([k]) => k === key);
    if (from === -1) continue;
    const [entry] = entries.splice(from, 1);

    if (add.first) {
      // Top of its OWN group, not of the document. A row added to Software
      // that jumped to index 0 would render under the spec table's heading,
      // which is a worse answer than leaving it where it was.
      const group = entry[1].group;
      const at = entries.findIndex(([, cell]) => cell.group === group);
      entries.splice(at === -1 ? 0 : at, 0, entry);
      continue;
    }

    const afterKey = normalizeKey(add.after ?? "");
    const anchor = entries.findIndex(([k]) => k === afterKey);
    if (anchor === -1) entries.splice(from, 0, entry);
    else entries.splice(anchor + 1, 0, entry);
  }
  return new Map(entries);
}

/**
 * Acronyms that must not be title-cased. Without them an invented row shows
 * up as "Ip Rating" or "Poe Input" — which looks like a typo on a document
 * a customer is reading, and is one, ours.
 */
const ACRONYMS = new Set([
  "ip", "poe", "led", "sim", "lan", "wan", "usb", "rf", "nr", "lte", "gsm",
  "mimo", "qos", "vpn", "ddns", "upnp", "dhcp", "dns", "ipv4", "ipv6", "emi",
  "esd", "cpu", "ram", "rom", "sku", "mtbf", "poe_plus", "gps", "ntp", "snmp",
]);

/** `poe_input` → `PoE Input`, `ip_rating` → `IP Rating`. */
function humanizeKey(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((w) =>
      w === "poe" ? "PoE" : ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
}

export interface ResolveInput {
  models: { raw_doc: unknown; rules: unknown }[];
  docRules: DocRules;
  blankPolicy: BlankMode;
}

/**
 * Build the printable matrix: one row per surviving spec, one cell per model.
 *
 * Row order MERGES the columns rather than concatenating them: each column's
 * rows keep their relative order, and a row only one column has is inserted
 * beside its neighbours from that column instead of being appended.
 *
 * The difference is not cosmetic. Concatenating puts every 5G-only row at the
 * bottom of a 4G/5G comparison, under Weight — so the spec that distinguishes
 * the two products reads as an afterthought. Merging puts 5G NR at the top
 * with the other radio specs and Antenna gain next to Dimensions, which is
 * where a reader looks for them.
 */
export function resolveMatrix({ models, docRules, blankPolicy }: ResolveInput): ResolvedRow[] {
  const columns = models.map((m) =>
    resolveColumn(asRawDoc(m.raw_doc), mergeRules(docRules, asRules(m.rules))),
  );

  const order: string[] = [];
  const labels = new Map<string, string>();
  const groups = new Map<string, string>();
  for (const col of columns) {
    // Where this column's last-placed row sits in the merged order; new rows
    // go directly after it (-1 → the very top).
    let anchor = -1;
    for (const [key, cell] of col) {
      const at = order.indexOf(key);
      if (at !== -1) {
        anchor = at;
      } else {
        order.splice(anchor + 1, 0, key);
        anchor += 1;
      }
      if (!labels.has(key)) {
        labels.set(key, cell.label);
      }
      // A row is only 'spec' if no column claims it for a real group —
      // when one source documents a software table and the other doesn't,
      // the row still belongs in the software table.
      if (cell.group !== "spec") groups.set(key, cell.group);
    }
  }

  const rows: ResolvedRow[] = [];
  for (const key of order) {
    const cells: ResolvedCell[] = columns.map((col, i) => {
      const hit = col.get(key);
      if (hit && !hit.isBlank) {
        return { value: hit.value, origin: hit.origin, isBlank: false, sourcePage: hit.sourcePage };
      }
      // Missing from this column entirely, or present but empty. Both are
      // "we don't have this yet" as far as the reader is concerned, and both
      // are normal at quoting time — the customer hasn't decided and the ODM
      // hasn't answered. A per-cell mode beats the document default.
      const mode =
        asRules(models[i].rules).blank?.[key] ??
        (docRules.blank?.[key] as BlankMode | undefined) ??
        blankPolicy;
      return { value: BLANK_TEXT[mode], origin: "blank", isBlank: true, sourcePage: null };
    });

    // Every column blank means nobody has this spec. Printing a row of TBDs
    // adds a line the reader has to process to learn nothing.
    if (cells.every((c) => c.isBlank)) continue;

    rows.push({
      key,
      label: labels.get(key) ?? humanizeKey(key),
      group: groups.get(key) ?? "spec",
      cells,
    });
  }

  return rows;
}

/**
 * Rules that no longer match anything — the cost of keying edits by source
 * label. Shown in the editor after a re-extract so a dropped override is a
 * visible decision rather than a silent regression.
 */
export function findOrphanedRules(raw: RawSpecRow[], rules: SpecRules): string[] {
  const known = new Set(raw.map((r) => r.key));
  for (const add of rules.add ?? []) known.add(add.key || normalizeKey(add.label));

  const referenced = [
    ...(rules.hide ?? []),
    ...Object.keys(rules.rename ?? {}),
    ...Object.keys(rules.blank ?? {}),
    // `override` is excluded on purpose: an override against an unknown key
    // is a deliberate addition (see resolveColumn), not an orphan.
  ];

  return [...new Set(referenced.filter((k) => !known.has(k)))];
}
