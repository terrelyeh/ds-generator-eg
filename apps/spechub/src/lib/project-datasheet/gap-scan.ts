/**
 * Gap review — what this document still needs before it can go out.
 *
 * The module is not a converter that produces a finished datasheet in one
 * shot; it is a conversation with sales that converges on one. This scanner
 * is the half of that conversation the tool can hold up its own end of: it
 * reads the current document and says what is missing, what looks doubtful,
 * and what is actually dangerous.
 *
 * ── Deterministic on purpose ────────────────────────────────────────────
 * No LLM here. Every check below is a rule with a stable `code`, so the same
 * document always produces the same findings, a finding can be tracked across
 * rescans, and nobody has to wonder whether the absence of a warning means
 * "clear" or "the model didn't notice". A question put to an ODM should also
 * be worded the same way every time. LLM belongs at intake (turning sales'
 * prose into rules and questions), not here.
 *
 * ── Blocking vs advisory ────────────────────────────────────────────────
 * The line is NOT how much is missing. A preliminary datasheet is supposed
 * to be incomplete — the customer hasn't decided and the ODM hasn't answered,
 * and TBD says so honestly.
 *
 *   advisory = the document is INCOMPLETE   (normal at this stage)
 *   blocking = the document would be WRONG  (a number we invented, a spec
 *                                            that contradicts itself, a
 *                                            term we said we'd removed)
 *
 * That is why an unsourced value blocks and fourteen TBD cells do not.
 */

import { asRawDoc, asRules, mergeRules, normalizeKey } from "./resolve";
import type { DocRules, FeatureBlock, ResolvedRow, SpecRules } from "./types";

export type FindingKind = "missing" | "doubt" | "risk";
export type Severity = "blocking" | "advisory";
export type AskedOf = "sales" | "rd" | "odm" | "internal";

export interface Finding {
  /** stable identity across rescans: (code, modelId, rowKey) */
  code: string;
  kind: FindingKind;
  severity: Severity;
  askedOf: AskedOf;
  /** null when the finding is about the document rather than one column */
  modelId: string | null;
  /** null when the finding is not about one spec row */
  rowKey: string | null;
  title: string;
  detail: string;
}

export interface ScanModel {
  id: string;
  model_name: string;
  display_name: string | null;
  overview: string | null;
  images: unknown;
  raw_doc: unknown;
  rules: unknown;
}

export interface ScanInput {
  doc: {
    id: string;
    name: string;
    customer: string | null;
    overview: string | null;
    headline: string | null;
    series_name: string | null;
    category_label: string | null;
    footnote: string | null;
    features: unknown;
    doc_rules: unknown;
    sections: unknown;
  };
  models: ScanModel[];
  /** the resolved matrix, so the scanner sees exactly what will print */
  rows: ResolvedRow[];
  /**
   * The source documents' full text, when extraction has run.
   *
   * A supplier states plenty of specs in PROSE that never reach its spec
   * table — the 5G sheet's overview says "the waterproof level is up to
   * IP66" while the table says nothing about ingress at all. Without this the
   * scanner can only report "no source for IP67", which is true and much
   * less useful than "the source says IP66".
   */
  sourceText?: string;
}

// ── residue detection ──────────────────────────────────────────────────────

/**
 * Hidden spec families and the words that give them away elsewhere.
 *
 * Hiding a row is not the same as removing a subject. "Don't show Wi-Fi"
 * removes three spec rows and leaves the overview saying the unit converts
 * signals into "Ethernet and WiFi signals" — which is the sentence a customer
 * reads. Label-derived terms catch the subject; value-derived tokens (below)
 * catch part numbers, which is what a chipset actually leaks as.
 */
const HIDDEN_FAMILIES: { match: RegExp; terms: RegExp[]; label: string }[] = [
  { match: /wi-?fi|wlan|wireless/i, terms: [/\bwi-?fi\b/i, /802\.11/], label: "Wi-Fi" },
  { match: /\bmesh\b/i, terms: [/\bmesh\b/i], label: "MESH" },
  { match: /bluetooth|\bble\b/i, terms: [/\bbluetooth\b/i, /\bBLE\b/], label: "Bluetooth" },
  // chipset / memory leak as part numbers, not as the word "CPU" — value
  // tokens do the work, so no label terms here.
  { match: /^cpu$|chipset|\bsoc\b|processor/i, terms: [], label: "chipset" },
  { match: /^flash$|^ram$|^memory$/i, terms: [], label: "memory" },
];

/**
 * Part-number-ish tokens out of a hidden value: two or more letters followed
 * by two or more digits, e.g. MTK7621AT, SDX62, IPQ5018, RM520N-GL.
 *
 * The digit requirement is what keeps MIMO out. "4 × 4 MIMO" is a legitimate
 * cellular spec on a visible row, and a residue scanner that flags it every
 * time trains people to ignore it.
 */
const PART_NUMBER = /\b[A-Z]{2,}[0-9]{2,}[A-Z0-9]*(?:-[A-Z0-9]+)?\b/g;

function residueTerms(hiddenRows: { label: string; value: string }[]) {
  const out: { term: RegExp; subject: string }[] = [];
  const seen = new Set<string>();

  const push = (term: RegExp, subject: string) => {
    const id = `${term.source}|${subject}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ term, subject });
  };

  for (const row of hiddenRows) {
    for (const fam of HIDDEN_FAMILIES) {
      if (!fam.match.test(row.label)) continue;
      for (const t of fam.terms) push(t, fam.label);
    }
    for (const token of row.value.toUpperCase().match(PART_NUMBER) ?? []) {
      if (token.length < 5) continue;
      push(new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), token);
    }
  }
  return out;
}

// ── power ──────────────────────────────────────────────────────────────────

/** "＜24W（POE 48V/0.6A）" / "< 18 W" → 24 / 18. Fullwidth included. */
function parseWatts(value: string): number | null {
  const m = value.replace(/[＜＞]/g, "<").match(/([0-9]+(?:\.[0-9]+)?)\s*W\b/i);
  return m ? Number(m[1]) : null;
}

/** PoE class ceilings at the powered device, in watts. */
const POE_BUDGET: { re: RegExp; name: string; watts: number }[] = [
  { re: /802\.3af\b/i, name: "802.3af", watts: 15.4 },
  { re: /802\.3at\b/i, name: "802.3at", watts: 25.5 },
  { re: /802\.3bt\b/i, name: "802.3bt", watts: 60 },
];

// ── source vs override ─────────────────────────────────────────────────────

/**
 * Measurements, as unit → the set of values quoted in that unit.
 *
 * Comparing whole strings makes every unit cleanup ("1.35KG（Includes color
 * box accessories）" → "1.35 kg") look like a spec change, which buries the
 * one edit that IS one. Comparing measurements asks the question a reviewer
 * actually has: did this override change what the product IS, or only how it
 * reads?
 */
const MEASUREMENT =
  /(-?\d+(?:\.\d+)?)\s*(°\s?[CF]|℃|℉|W\b|V\b|A\b|mA\b|kg\b|KG\b|g\b|mm\b|dBi\b|Mbps\b|Gbps\b|%)/gi;

function measurements(v: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  // −(U+2212) is not a hyphen; a temperature written with it parses as a
  // positive number, which would make −40 °C and 40 °C compare equal.
  const text = v.replace(/\u2212/g, "-");
  for (const m of text.matchAll(MEASUREMENT)) {
    const unit = m[2].toLowerCase().replace(/\s+/g, "").replace("℃", "°c").replace("℉", "°f");
    if (!out.has(unit)) out.set(unit, new Set());
    out.get(unit)!.add(String(Number(m[1])));
  }
  return out;
}

function words(v: string): Set<string> {
  return new Set(
    v
      .toLowerCase()
      // Split digit/letter boundaries so "24W" and "24 W" tokenise the same.
      // Without this every unit-spacing cleanup looks like new content
      // appearing out of nowhere, which is a blocking finding — the loudest
      // possible way to report a space.
      .replace(/([0-9])([a-z])/g, "$1 $2")
      .replace(/([a-z])([0-9])/g, "$1 $2")
      .replace(/[^a-z0-9.]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1),
  );
}

type Verdict = {
  kind: "same" | "measurement" | "added" | "dropped";
  headline: string;
  detail: string;
};

function compareToSource(src: string, override: string): Verdict {
  const a = measurements(src);
  const b = measurements(override);

  // A unit quoted in both, with different numbers, is a changed spec —
  // the temperature range being widened past what the ODM rated is exactly
  // this, and it is the most consequential edit a tender sheet can carry.
  const changedUnits = [...b.keys()].filter((u) => {
    const from = a.get(u);
    if (!from) return false;
    const to = b.get(u)!;
    return from.size !== to.size || [...to].some((x) => !from.has(x));
  });
  if (changedUnits.length > 0) {
    return {
      kind: "measurement",
      headline: `改了數值（${changedUnits.join("、")}）`,
      detail:
        "這是規格本身的改動，不是寫法的改動。送出去等於承諾一個來源沒背書的數字——請 RD 確認。",
    };
  }

  const wa = words(src);
  const wb = words(override);
  const added = [...wb].filter((w) => !wa.has(w));
  const dropped = [...wa].filter((w) => !wb.has(w));

  if (added.length === 0 && dropped.length === 0) return { kind: "same", headline: "", detail: "" };
  if (added.length === 0) {
    return {
      kind: "dropped",
      headline: "拿掉了來源的一部分",
      detail: `少了：${dropped.slice(0, 8).join("、")}。確認是刻意刪的（通常是）。`,
    };
  }
  // Both directions means the value was rewritten rather than trimmed, and
  // saying so beats reporting only the half that happens to be checked first.
  return {
    kind: "added",
    headline: dropped.length > 0 ? "被改寫過" : "寫了來源沒有的內容",
    detail:
      `新增：${added.slice(0, 8).join("、")}` +
      (dropped.length > 0 ? `；少了：${dropped.slice(0, 8).join("、")}` : "") +
      "。來源沒有這些，確認依據。",
  };
}

// ── coded specs stated in prose ────────────────────────────────────────────

/**
 * Specs written as codes, which is what makes them findable in running text.
 *
 * Only patterns where a mismatch is unambiguous belong here. "-40°C" appears
 * in prose in a dozen shapes and half of them are storage rather than
 * operating temperature, so matching it would produce confident nonsense.
 */
const CODED_SPECS: { name: string; re: RegExp }[] = [
  { name: "防護等級", re: /\bIP\s?(\d{2}K?)\b/gi },
  { name: "PoE 等級", re: /\b802\.3\s?(af|at|bt)\b/gi },
];

/** Distinct codes of each kind found in a blob of text. */
function codesIn(text: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const spec of CODED_SPECS) {
    const found = new Set<string>();
    for (const m of text.matchAll(spec.re)) found.add(m[0].replace(/\s+/g, "").toUpperCase());
    if (found.size) out.set(spec.name, found);
  }
  return out;
}

// ── cross-model consistency ────────────────────────────────────────────────

/**
 * Rows where two units in one enclosure family are normally identical. A
 * difference here is usually one source being transcribed and the other not,
 * and it is the first thing a customer asks about on a side-by-side sheet.
 */
const SHOULD_MATCH = new Set([
  "ingress_protection",
  "environment",
  "operating_temperature",
  "storage_temperature",
  "humidity",
  "warranty",
  "certification",
  "certifications",
  "mounting",
]);

// ── the scan ───────────────────────────────────────────────────────────────

export function scanDocument({ doc, models, rows, sourceText }: ScanInput): Finding[] {
  const findings: Finding[] = [];
  const add = (f: Finding) => findings.push(f);
  const sourceCodes = sourceText ? codesIn(sourceText) : new Map<string, Set<string>>();

  const docRules = (doc.doc_rules ?? {}) as DocRules;
  const perModel = models.map((m) => ({
    model: m,
    raw: asRawDoc(m.raw_doc),
    rules: mergeRules(docRules, asRules(m.rules) as SpecRules),
  }));

  // ── 缺 missing ────────────────────────────────────────────────────────
  if (!doc.customer?.trim()) {
    add({
      code: "no_customer",
      kind: "missing",
      severity: "advisory",
      askedOf: "sales",
      modelId: null,
      rowKey: null,
      title: "沒有填客戶",
      detail:
        "PRELIMINARY 聲明會寫成沒有對象的版本。標案文件通常要指名，也方便日後追這份是給誰的。",
    });
  }
  if (!doc.overview?.trim()) {
    add({
      code: "no_overview",
      kind: "missing",
      severity: "advisory",
      askedOf: "internal",
      modelId: null,
      rowKey: null,
      title: "封面沒有 Overview",
      detail: "來源的 overview 通常整段都是 chipset 和 Wi-Fi，不能直接用，要自己寫。",
    });
  }
  if (asFeatureBlocks(doc.features).length === 0) {
    add({
      code: "no_features",
      kind: "missing",
      severity: "advisory",
      askedOf: "internal",
      modelId: null,
      rowKey: null,
      title: "沒有 Features & Benefits",
      detail: "Features 頁會整頁不印。標案文件少了賣點頁只剩規格表。",
    });
  }

  for (const { model } of perModel) {
    const imgs = Array.isArray(model.images) ? model.images : [];
    if (imgs.length === 0) {
      add({
        code: "no_images",
        kind: "missing",
        severity: "advisory",
        askedOf: "internal",
        modelId: model.id,
        rowKey: null,
        title: `${model.model_name} 沒有產品圖`,
        detail: "封面會印佔位框。就算只是暫時借用相近機種的照片也比空框好（圖片註記會說明）。",
      });
    }
    if (!model.display_name?.trim()) {
      add({
        code: "no_display_name",
        kind: "missing",
        severity: "advisory",
        askedOf: "sales",
        modelId: model.id,
        rowKey: null,
        title: `${model.model_name} 沒有品名`,
        detail: "封面產品圖下方與規格表的 Description 欄會是空的。",
      });
    }
  }

  // Blank cells, grouped per row rather than per cell — "EOR100 這三格沒值"
  // is one thing to chase up, not three.
  //
  // Only for cells that actually PRINT. The renderer drops a column from a
  // group's table when it has nothing in that group at all, so EOR100 having
  // no software feature list produces one absent column, not fourteen missing
  // cells. Flagging what the reader will never see is how a review list
  // becomes something people scroll past.
  const rendersIn = renderedColumns(rows, models.length);
  for (const row of rows) {
    const visible = rendersIn.get(row.group) ?? new Set<number>();
    const blanks = row.cells
      .map((c, i) => (c.isBlank && visible.has(i) ? models[i] : null))
      .filter((m): m is ScanModel => !!m);
    if (blanks.length === 0 || blanks.length === visible.size) continue;
    add({
      code: "blank_cell",
      kind: "missing",
      severity: "advisory",
      askedOf: "odm",
      modelId: null,
      rowKey: row.key,
      title: `${row.label} — ${blanks.map((m) => m.model_name).join("、")} 沒有值`,
      detail: `其他型號有值，這幾台沒有。跟 ODM 要，或確認「本來就沒有」（那要改成 — 而不是 TBD）。`,
    });
  }

  // ── 疑 doubt ──────────────────────────────────────────────────────────
  for (const { model, raw, rules } of perModel) {
    const sourced = new Map(raw.map((r) => [r.key, r.value]));

    for (const [key, value] of Object.entries(rules.override ?? {})) {
      if (rules.hide?.includes(key)) continue;
      const src = sourced.get(key);
      if (src === undefined) {
        // A value the spec TABLE lacks may still be stated in the source's
        // prose, and if the prose says something else that is a far sharper
        // question than "where did this come from".
        const contradiction = proseConflict(value, sourceCodes);
        if (contradiction) {
          add({
            code: "source_prose_conflict",
            kind: "doubt",
            severity: "blocking",
            askedOf: "rd",
            modelId: model.id,
            rowKey: key,
            title: `${model.model_name} — ${labelFor(rows, key)} 跟來源內文不一樣`,
            detail:
              `文件寫「${value}」，但來源的內文寫的是「${contradiction.found}」` +
              `（不在規格表裡，在敘述段落）。改這個等於改${contradiction.name}，` +
              `要 RD 確認做得到。`,
          });
        } else {
          add({
            code: "unsourced_value",
            kind: "doubt",
            severity: "blocking",
            askedOf: "rd",
            modelId: model.id,
            rowKey: key,
            title: `${model.model_name} — ${labelFor(rows, key)} 的值不是來源給的`,
            detail:
              `文件寫「${value}」，但來源規格表沒有這一項。這個數字是我們自己填進去的，` +
              `送出去就是對客戶的承諾——請 RD 確認。`,
          });
        }
      } else {
        const verdict = compareToSource(src, value);
        if (verdict.kind === "same") continue;
        add({
          code:
            verdict.kind === "measurement"
              ? "override_changes_measurement"
              : verdict.kind === "added"
                ? "override_conflicts_source"
                : "override_drops_content",
          kind: "doubt",
          severity: verdict.kind === "dropped" ? "advisory" : "blocking",
          askedOf: "rd",
          modelId: model.id,
          rowKey: key,
          title: `${model.model_name} — ${labelFor(rows, key)} ${verdict.headline}`,
          detail:
            `來源寫「${truncate(src)}」，文件寫「${truncate(value)}」。${verdict.detail}`,
        });
      }
    }

    for (const added of rules.add ?? []) {
      const key = added.key || normalizeKey(added.label);
      if (sourced.has(key) || rules.override?.[key] !== undefined) continue;
      add({
        code: "unsourced_value",
        kind: "doubt",
        severity: "blocking",
        askedOf: "rd",
        modelId: model.id,
        rowKey: key,
        title: `${model.model_name} — ${added.label} 的值不是來源給的`,
        detail:
          `文件寫「${added.value}」，來源規格表沒有這一項。這個數字是我們自己加的，` +
          `送出去就是對客戶的承諾——請 RD 確認。`,
      });
    }
  }

  // Rows two units in one family should normally agree on.
  for (const row of rows) {
    if (!SHOULD_MATCH.has(row.key)) continue;
    const values = row.cells.filter((c) => !c.isBlank).map((c) => normalize(c.value));
    if (new Set(values).size <= 1) continue;
    add({
      code: "models_disagree",
      kind: "doubt",
      severity: "advisory",
      askedOf: "rd",
      modelId: null,
      rowKey: row.key,
      title: `${row.label} — 兩台不一樣`,
      detail:
        "同一個外殼家族的機種在這一項通常一致。並排印出來客戶一定會問，" +
        "確認是真的不同，還是其中一份來源沒抄到。",
    });
  }

  // ── 險 risk ───────────────────────────────────────────────────────────
  // Residue: a subject we said we'd removed, still readable somewhere else.
  const hiddenRows = perModel.flatMap(({ raw, rules }) => {
    const hidden = new Set(rules.hide ?? []);
    return raw.filter((r) => hidden.has(r.key));
  });
  const terms = residueTerms(hiddenRows);

  if (terms.length > 0) {
    const haystacks: { where: string; text: string }[] = [
      { where: "封面 Overview", text: doc.overview ?? "" },
      { where: "封面標題", text: [doc.headline, doc.series_name, doc.category_label].join(" ") },
      { where: "頁尾註記", text: doc.footnote ?? "" },
      {
        where: "Features & Benefits",
        text: asFeatureBlocks(doc.features)
          .flatMap((b) => [b.title, ...b.bullets])
          .join(" "),
      },
      ...models.map((m) => ({
        where: `${m.model_name} 品名／說明`,
        text: [m.display_name, m.overview].filter(Boolean).join(" "),
      })),
      // Visible spec values matter as much as prose — hiding the Wi-Fi rows
      // does nothing about "WIFI: 1024-QAM" sitting inside Modulation Mode.
      ...rows.flatMap((row) =>
        row.cells
          .map((c, i) =>
            c.isBlank ? null : { where: `規格表 ${row.label}（${models[i].model_name}）`, text: c.value },
          )
          .filter((h): h is { where: string; text: string } => !!h),
      ),
    ];

    for (const { term, subject } of terms) {
      const hits = haystacks.filter((h) => h.text && term.test(h.text));
      if (hits.length === 0) continue;
      add({
        code: `residue:${subject}`,
        kind: "risk",
        severity: "blocking",
        askedOf: "internal",
        modelId: null,
        rowKey: null,
        title: `「${subject}」已經隱藏，但文件裡還看得到`,
        detail:
          `出現在：${hits.map((h) => h.where).join("、")}。` +
          `隱藏規格列不會動到文案和其他欄位的值——客戶讀的是這些句子。`,
      });
    }
  }

  // PoE class vs actual draw.
  for (let i = 0; i < models.length; i++) {
    const poeRow = rows.find((r) => /poe|power over ethernet/i.test(r.key + " " + r.label));
    const drawRow = rows.find((r) => /power_consumption|power consumption/i.test(r.key + " " + r.label));
    if (!poeRow || !drawRow) continue;
    const poe = poeRow.cells[i];
    const draw = drawRow.cells[i];
    if (poe.isBlank || draw.isBlank) continue;
    const watts = parseWatts(draw.value);
    if (watts === null) continue;
    const lowest = POE_BUDGET.filter((c) => c.re.test(poe.value)).sort((a, b) => a.watts - b.watts)[0];
    if (!lowest || watts <= lowest.watts) continue;
    add({
      code: "poe_underpowered",
      kind: "risk",
      severity: "blocking",
      askedOf: "rd",
      modelId: models[i].id,
      rowKey: poeRow.key,
      title: `${models[i].model_name} — ${lowest.name} 餵不動 ${watts} W`,
      detail:
        `${lowest.name} 在受電端上限 ${lowest.watts} W，這台標 ${watts} W。` +
        `客戶拿 ${lowest.name} 的 switch 去接會出事。` +
        `要嘛只寫較高的等級，要嘛加註「full performance requires 802.3at」。`,
    });
  }

  // A section switched on with nothing to print.
  const sections = (doc.sections ?? {}) as Record<string, boolean>;
  for (const [group, key] of [
    ["software", "software"],
    ["package", "package"],
  ] as const) {
    if (!sections[key]) continue;
    if (rows.some((r) => r.group === group)) continue;
    add({
      code: `empty_section:${key}`,
      kind: "missing",
      severity: "advisory",
      askedOf: "internal",
      modelId: null,
      rowKey: null,
      title: `${key === "software" ? "Software Features" : "Package Contents"} 開著但沒有內容`,
      detail: `區塊是開的，但沒有標成 ## ${group} 的規格列，所以整頁不會印。`,
    });
  }

  return findings;
}

/**
 * Which model columns each group's table renders — the same rule the
 * renderer applies, kept in step with it deliberately: a column with nothing
 * in a group is dropped rather than printed as a stack of TBDs.
 */
function renderedColumns(rows: ResolvedRow[], modelCount: number): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const row of rows) {
    if (!out.has(row.group)) out.set(row.group, new Set());
  }
  for (const [group, set] of out) {
    for (let i = 0; i < modelCount; i++) {
      if (rows.some((r) => r.group === group && !r.cells[i].isBlank)) set.add(i);
    }
  }
  return out;
}

/**
 * Does the source's prose state a DIFFERENT code of the same kind?
 *
 * "Different" is the whole test. A source that also says IP67 is agreement,
 * not conflict, and reporting it would train people to skip these.
 */
function proseConflict(
  value: string,
  sourceCodes: Map<string, Set<string>>,
): { name: string; found: string } | null {
  for (const spec of CODED_SPECS) {
    const ours = new Set(
      [...value.matchAll(spec.re)].map((m) => m[0].replace(/\s+/g, "").toUpperCase()),
    );
    if (ours.size === 0) continue;
    const theirs = sourceCodes.get(spec.name);
    if (!theirs || theirs.size === 0) continue;
    if ([...ours].some((o) => theirs.has(o))) continue;
    return { name: spec.name, found: [...theirs].join("、") };
  }
  return null;
}

/** Stable identity for a finding across rescans. */
export function findingId(f: Pick<Finding, "code" | "modelId" | "rowKey">): string {
  return `${f.code}|${f.modelId ?? ""}|${f.rowKey ?? ""}`;
}

/** The same identity, computed off a stored row's snake_case columns. */
export function storedFindingId(q: {
  code: string;
  model_id: string | null;
  row_key: string | null;
}): string {
  return `${q.code}|${q.model_id ?? ""}|${q.row_key ?? ""}`;
}

// ── helpers ────────────────────────────────────────────────────────────────

function normalize(v: string): string {
  return v.replace(/\s+/g, " ").trim().toLowerCase();
}

function truncate(v: string, n = 60): string {
  const one = v.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
}

function labelFor(rows: ResolvedRow[], key: string): string {
  return rows.find((r) => r.key === key)?.label ?? key;
}

function asFeatureBlocks(value: unknown): FeatureBlock[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((b) =>
    b && typeof b === "object" && typeof (b as FeatureBlock).title === "string"
      ? [
          {
            title: (b as FeatureBlock).title,
            bullets: Array.isArray((b as FeatureBlock).bullets) ? (b as FeatureBlock).bullets : [],
          },
        ]
      : [],
  );
}
