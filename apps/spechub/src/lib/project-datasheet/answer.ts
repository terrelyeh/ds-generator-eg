/**
 * Answer → rule.
 *
 * The gap review asks "EOR100 has no Antenna gain" and someone comes back
 * with "5 dBi ×4". Until now that answer was filed as text and the spec table
 * was edited by hand, which meant the loop had a manual step in the middle of
 * it and the answer and the value could drift apart.
 *
 * This closes it — through exactly the same pipeline as requirements intake:
 * propose, show what would be overwritten, let a human tick. One proposal
 * shape, one apply path, one review UI. An answer is not more trustworthy
 * than a note from sales just because it arrived later.
 *
 * ── The hard case is "no change" ───────────────────────────────────────
 * Most answers to a doubt-class question are confirmations: "yes, the
 * housing is rated IP67". The correct output is NOTHING — the question
 * closes and the value stands. A model that felt obliged to produce an edit
 * would rewrite a correct spec into a paraphrase of the reply, which is how
 * "IP67" becomes "IP67 (confirmed by RD)" on a customer's datasheet.
 */

import type { IntakeItem } from "./intake";
import type { ResolvedRow } from "./types";

export const ANSWER_SYSTEM = `You convert an answer to a question about an EnGenius PROJECT datasheet into
proposed spec edits. A project datasheet quotes hardware that may not exist
yet; every value on it is a commitment to a customer.

Return ONLY a JSON object: {"items": [...]}

Item types (omit any you don't need):
  {"type":"doc_hide","key":"<key>","label":"<label>","because":"<the answer>"}
  {"type":"doc_override","key":"<key>","label":"<label>","value":"<value>","because":"..."}
  {"type":"model_add","modelName":"<model>","key":"<key>","label":"<label>","value":"<value>","after":null,"because":"..."}
  {"type":"model_override","modelName":"<model>","key":"<key>","value":"<value>","because":"..."}
  {"type":"model_blank","modelName":"<model>","key":"<key>","mode":"na","because":"..."}

Rules you must follow:

1. If the answer CONFIRMS what the document already says, return {"items":[]}.
   Confirmation is not an edit. Never restate a confirmed value, never append
   "(confirmed)" or a source to it, never reword it.
2. Only propose a value the answer actually states, and keep EVERY number and
   qualifier it gives. "4 根 5 dBi 全向天線" is "4 × 5 dBi omnidirectional",
   not "5 dBi omnidirectional" — dropping the count loses the spec. If the
   answer is vague ("should be fine", "roughly the same"), return
   {"items":[]} — a person will chase it.
3. "This model doesn't have that" → model_blank with mode "na". Do NOT use it
   for "we'll get back to you"; that leaves the cell as it is.
3a. An answer often settles more than the one row that was asked about
   ("EOR100 是 4G 機種，這幾項不適用" answers every 5G row). The rows that
   model currently has no value for are listed under ROWS WITH NO VALUE; emit
   an item for each one the answer plainly covers. Only ones it plainly
   covers — do not sweep up a row just because it is empty.
4. An override REPLACES the row's whole value. To record a spec the document
   does not carry yet, use model_add with a new key.
5. If the answer covers several models, emit one item per model.
6. "because" is the answer's own words, trimmed to one line. It is the audit
   trail for why the value changed.

Do not add commentary outside the JSON.`;

export function buildAnswerPrompt(input: {
  questionTitle: string;
  questionDetail: string;
  answer: string;
  rowKey: string | null;
  modelNames: string[];
  /** current printed values for the row in question, per model */
  current: { modelName: string; value: string; isBlank: boolean }[];
  /**
   * Rows each model currently has nothing for. One reply frequently settles a
   * whole family of them ("it's the 4G unit, none of the 5G rows apply"), and
   * without this the person answers the same sentence four times.
   */
  blanks?: { modelName: string; keys: { key: string; label: string }[] }[];
}): string {
  const current = input.current.length
    ? input.current
        .map((c) => `  ${c.modelName}: ${c.isBlank ? `(空白 — 目前印 ${c.value})` : c.value}`)
        .join("\n")
    : "  (this question is not about one spec row)";

  const blanks = (input.blanks ?? [])
    .filter((b) => b.keys.length > 0)
    .map((b) => `  ${b.modelName}: ${b.keys.map((k) => `${k.key} (${k.label})`).join(", ")}`)
    .join("\n");

  return [
    `MODELS: ${input.modelNames.join(", ")}`,
    input.rowKey ? `SPEC KEY: ${input.rowKey}` : "SPEC KEY: (none)",
    "",
    "WHAT THE DOCUMENT CURRENTLY SAYS:",
    current,
    "",
    ...(blanks ? ["ROWS WITH NO VALUE:", blanks, ""] : []),
    "QUESTION:",
    input.questionTitle,
    input.questionDetail,
    "",
    "ANSWER:",
    input.answer.trim(),
  ].join("\n");
}

/** Current printed values for a row, for the prompt and for `replaces`. */
export function currentValues(
  rows: ResolvedRow[],
  rowKey: string | null,
  modelNames: string[],
): { modelName: string; value: string; isBlank: boolean }[] {
  if (!rowKey) return [];
  const row = rows.find((r) => r.key === rowKey);
  if (!row) return [];
  return row.cells.map((c, i) => ({
    modelName: modelNames[i] ?? `#${i}`,
    value: c.value,
    isBlank: c.isBlank,
  }));
}

/** Rows each model currently prints nothing real for. */
export function blankRows(
  rows: ResolvedRow[],
  modelNames: string[],
): { modelName: string; keys: { key: string; label: string }[] }[] {
  return modelNames.map((modelName, i) => ({
    modelName,
    keys: rows
      .filter((r) => r.cells[i]?.isBlank)
      .map((r) => ({ key: r.key, label: r.label })),
  }));
}

/**
 * What each proposed item would overwrite.
 *
 * Same guard intake uses, and for the same reason: an override that lands on
 * the wrong row destroys content rather than adding any, and reads as
 * perfectly reasonable until the replaced value is on screen next to it.
 * Answers are no safer than notes — they arrive as one line of chat.
 */
export function annotateReplacements(
  items: IntakeItem[],
  rows: ResolvedRow[],
  modelNames: string[],
): void {
  const at = (key: string, modelName: string): string | null => {
    const row = rows.find((r) => r.key === key);
    if (!row) return null;
    const i = modelNames.indexOf(modelName);
    const cell = i >= 0 ? row.cells[i] : null;
    return cell && !cell.isBlank ? cell.value : null;
  };

  for (const item of items) {
    switch (item.type) {
      case "doc_override": {
        const row = rows.find((r) => r.key === item.key);
        item.replaces = row?.cells.find((c) => !c.isBlank)?.value ?? null;
        break;
      }
      case "model_override":
      case "model_add":
      case "model_blank":
        item.replaces = at(item.key, item.modelName);
        break;
      default:
        item.replaces = null;
    }
  }
}
