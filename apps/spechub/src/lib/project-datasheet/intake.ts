/**
 * Requirements intake — sales' note in, proposed rules and questions out.
 *
 * This is the front door of the guided loop. What arrives from sales is never
 * a spec; it is a handful of numbered lines in two languages, mixing things
 * the tool can act on ("不要放 chipset") with things only a person can settle
 * ("圖片是 EnGenius model" — which model, which photo?).
 *
 * ── Proposes, never applies ─────────────────────────────────────────────
 * Nothing here writes. The model returns a list of proposals, each carrying
 * the line of the note it came from, and a human accepts them one at a time.
 * An LLM that silently rewrote the rules of a document we are about to quote
 * a customer from would be the least auditable thing in the module — and the
 * module's whole posture is the opposite: extraction proposes and a human
 * confirms, raw stays immutable beside human edits, answers don't rewrite
 * specs. Intake is the same shape.
 *
 * ── Why it may not guess ────────────────────────────────────────────────
 * The prompt's hardest instruction is to emit a QUESTION rather than a rule
 * whenever the note is ambiguous. A tool that quietly resolves ambiguity in
 * a tender document converts "sales didn't say" into "the datasheet says",
 * which is precisely the failure the gap review exists to catch. Better to
 * hand the ambiguity back while someone can still ask.
 */

import type { AskedOf } from "./gap-scan";

/**
 * `replaces` is filled in AFTER parsing, by comparing against the document.
 * It is the current value an item would overwrite — the single most important
 * thing to put in front of a reviewer, because an override that lands on the
 * wrong row destroys content rather than adding any, and reads as a perfectly
 * reasonable proposal until you see what was there.
 */
export type IntakeItem = IntakeItemBase & { replaces?: string | null };

type IntakeItemBase =
  | { type: "doc_hide"; key: string; label: string; because: string }
  | { type: "doc_override"; key: string; label: string; value: string; because: string }
  | {
      type: "model_add";
      modelName: string;
      key: string;
      label: string;
      value: string;
      after?: string | null;
      because: string;
    }
  | { type: "model_override"; modelName: string; key: string; value: string; because: string }
  | {
      /**
       * Hide a row on ONE model. `doc_hide` removes it everywhere, which is
       * wrong when the row belongs to one supplier's wording and another
       * column has the same fact under a different name — the merge folds
       * one into the other and only the folded column should lose its row.
       */
      type: "model_hide";
      modelName: string;
      key: string;
      because: string;
    }
  | {
      /**
       * "This model doesn't have that." Distinct from an empty value: TBD
       * means an answer is still coming, — means there is nothing to come.
       * Only an answer can tell those apart, which is why this type exists.
       */
      type: "model_blank";
      modelName: string;
      key: string;
      mode: "na" | "tbd";
      because: string;
    }
  | { type: "doc_field"; field: DocField; value: string; because: string }
  | { type: "question"; askedOf: AskedOf; title: string; detail: string; because: string };

export type DocField =
  | "headline"
  | "series_name"
  | "category_label"
  | "overview"
  | "footnote";

const DOC_FIELDS: DocField[] = [
  "headline",
  "series_name",
  "category_label",
  "overview",
  "footnote",
];

const ASKED_OF: AskedOf[] = ["sales", "rd", "odm", "internal"];

export interface IntakeProposal {
  items: IntakeItem[];
  /** anything the model read but deliberately did nothing with */
  ignored: string[];
}

export const INTAKE_SYSTEM = `You turn a sales requirements note for an EnGenius PROJECT datasheet into
proposed edits. A project datasheet retargets a supplier's spec sheet onto
EnGenius naming for a tender; the product may not exist yet.

Return ONLY a JSON object: {"items": [...], "ignored": ["..."]}

Item types:
  {"type":"doc_hide","key":"<spec key>","label":"<spec label>","because":"<the source line>"}
  {"type":"doc_override","key":"<spec key>","label":"<label>","value":"<value>","because":"..."}
  {"type":"model_add","modelName":"<model>","key":"<key>","label":"<label>","value":"<value>","after":"<key or null>","because":"..."}
  {"type":"model_override","modelName":"<model>","key":"<key>","value":"<value>","because":"..."}
  {"type":"model_blank","modelName":"<model>","key":"<key>","mode":"na|tbd","because":"..."}
  {"type":"doc_field","field":"headline|series_name|category_label|overview|footnote","value":"...","because":"..."}
  {"type":"question","askedOf":"sales|rd|odm|internal","title":"<short, zh-TW>","detail":"<what to ask, zh-TW>","because":"..."}

Rules you must follow:

1. NEVER invent a value the note does not state. If the note says a spec
   should change but not to what, emit a question.
2. Prefer keys from the SPEC KEYS list. Only invent a key when the note asks
   for a spec that does not exist yet (e.g. an ingress rating no source lists).
2a. An override REPLACES that row's entire value. Use it only when the note
   restates the whole of that row. A spec the note introduces gets its OWN new
   key — never fold it into a related row. "PoE is 802.3af/at" is a NEW
   power_over_ethernet row; writing it over "interface" would delete the port,
   reset and SIM information that row holds. When in doubt, add a row.
3. "Don't show X" → doc_hide for EVERY existing key that belongs to X, not
   just the one whose label matches. Hiding "Wi-Fi" means the Wi-Fi frequency,
   standard, throughput AND mesh rows.
4. A value that differs per model → one item per model. If the note gives one
   value and you cannot tell whether it applies to every model, apply it to
   all of them and ALSO emit a question saying you did.
5. Anything about images, artwork, layout, which models to include, or the
   customer relationship is NOT a rule. Emit a question (askedOf "internal"
   for our own to-dos, "sales" for things only sales or the customer knows).
6. Questions are written in Traditional Chinese, for a colleague. Be specific
   about what you need and why it matters.
7. "because" is the note's own line, copied verbatim. It is the audit trail.
8. Put lines you deliberately did nothing with in "ignored" — do not silently
   drop anything.

Do not add commentary outside the JSON.`;

export function buildIntakePrompt(input: {
  note: string;
  modelNames: string[];
  specKeys: { key: string; label: string }[];
}): string {
  const keys = input.specKeys.length
    ? input.specKeys.map((k) => `  ${k.key}  (${k.label})`).join("\n")
    : "  (none yet — the document has no spec rows)";
  return [
    `MODELS IN THIS DATASHEET: ${input.modelNames.join(", ") || "(none yet)"}`,
    "",
    "SPEC KEYS ALREADY IN THE DOCUMENT:",
    keys,
    "",
    "SALES REQUIREMENTS NOTE:",
    input.note.trim(),
  ].join("\n");
}

/**
 * Parse the model's reply into items we are willing to act on.
 *
 * Deliberately strict. A malformed item is dropped rather than coerced: the
 * user reviews this list and accepts from it, so a half-understood proposal
 * that looks plausible is worse than one that never appears.
 */
export function parseProposal(raw: string, modelNames: string[]): IntakeProposal {
  const json = extractJson(raw);
  if (!json) return { items: [], ignored: [] };

  const ignored = (Array.isArray(json.ignored) ? json.ignored : [])
    .map((v) => str(v))
    .filter(Boolean);

  return { items: sanitizeItems(json.items, modelNames), ignored };
}

/**
 * Validate a list of proposed items, dropping anything malformed.
 *
 * Also the gate for items that come back from the browser, where a proposal
 * is reviewed before it is applied. Not a privilege boundary — whoever is
 * ticking these can already write rules directly — but a shape boundary: a
 * half-formed item that reached the merge would corrupt `rules` in a way
 * nothing downstream is written to survive.
 */
export function sanitizeItems(rawItems: unknown, modelNames: string[]): IntakeItem[] {
  const known = new Set(modelNames);
  const items: IntakeItem[] = [];

  for (const entry of Array.isArray(rawItems) ? rawItems : []) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const because = str(e.because);
    const key = slug(str(e.key));

    switch (e.type) {
      case "doc_hide":
        if (key) items.push({ type: "doc_hide", key, label: str(e.label) || key, because });
        break;
      case "doc_override":
        if (key && str(e.value))
          items.push({
            type: "doc_override",
            key,
            label: str(e.label) || key,
            value: str(e.value),
            because,
          });
        break;
      case "model_add":
        // A proposal aimed at a model that isn't in the document would apply
        // to nothing, and showing it as an accepted change would be a lie.
        if (key && known.has(str(e.modelName)) && str(e.value))
          items.push({
            type: "model_add",
            modelName: str(e.modelName),
            key,
            label: str(e.label) || key,
            value: str(e.value),
            after: slug(str(e.after)) || null,
            because,
          });
        break;
      case "model_hide":
        if (key && known.has(str(e.modelName)))
          items.push({ type: "model_hide", modelName: str(e.modelName), key, because });
        break;
      case "model_override":
        if (key && known.has(str(e.modelName)) && str(e.value))
          items.push({
            type: "model_override",
            modelName: str(e.modelName),
            key,
            value: str(e.value),
            because,
          });
        break;
      case "model_blank":
        if (key && known.has(str(e.modelName)) && (e.mode === "na" || e.mode === "tbd"))
          items.push({
            type: "model_blank",
            modelName: str(e.modelName),
            key,
            mode: e.mode,
            because,
          });
        break;
      case "doc_field":
        if (DOC_FIELDS.includes(e.field as DocField) && str(e.value))
          items.push({
            type: "doc_field",
            field: e.field as DocField,
            value: str(e.value),
            because,
          });
        break;
      case "question":
        if (str(e.title))
          items.push({
            type: "question",
            askedOf: ASKED_OF.includes(e.askedOf as AskedOf) ? (e.askedOf as AskedOf) : "internal",
            title: str(e.title),
            detail: str(e.detail),
            because,
          });
        break;
    }
  }

  return items;
}

/** One-line summary for the review list. */
export function describeItem(item: IntakeItem): string {
  switch (item.type) {
    case "doc_hide":
      return `隱藏「${item.label}」（整份文件）`;
    case "doc_override":
      return `「${item.label}」設為「${item.value}」（整份文件）`;
    case "model_add":
      return `${item.modelName} 新增「${item.label}」= ${item.value}`;
    case "model_hide":
      return `${item.modelName} 隱藏「${item.key}」這一列`;
    case "model_override":
      return `${item.modelName} 的「${item.key}」改為「${item.value}」`;
    case "model_blank":
      return item.mode === "na"
        ? `${item.modelName} 的「${item.key}」標成不適用（印 —）`
        : `${item.modelName} 的「${item.key}」標成待補（印 TBD）`;
    case "doc_field":
      return `${item.field} 設為「${truncate(item.value)}」`;
    case "question":
      return item.title;
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function slug(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function truncate(v: string, n = 48): string {
  const one = v.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
}

/** Models wrap JSON in prose or fences often enough to be worth handling. */
function extractJson(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}
