/**
 * Layout D's spec table (Broadband): which rows print, in what order, and —
 * the part that has to happen last — in which language.
 *
 * One row per distinct spec label across the columns (a series sheet has one
 * column per model, a per-model sheet has one). A row prints when any column
 * has something real to say in it.
 *
 * ## Translate last
 *
 * Per-line spec label translations (`spec_label_translations`) are loaded by
 * the preview page for every layout, but only layout A ever applied them:
 * Broadband, Data Center and Edge AI were handed the English labels and
 * printed them, so EOC's Japanese datasheet carried 76 translated labels and
 * showed none of them (reported 2026-10-01, a day after the labels were
 * translated).
 *
 * The fix is one line, and the order around it is the whole point. The layout
 * recognises rows by their ENGLISH label — the Model Number row is dropped by
 * regex here, and `radioPatternSlots` decides which antenna pages exist by
 * reading the same labels elsewhere — so translating earlier makes those
 * rules quietly stop matching: no row dropped, no antenna page, nothing
 * logged. The paginator downstream has the opposite need: it measures what
 * actually prints, and a Japanese label wraps where its English original did
 * not. So the translation belongs exactly here, after the filters and before
 * the page split.
 */

/** One printed row: the label column, then one cell per model column. */
export interface BroadbandSpecRow {
  label: string;
  values: string[];
}

interface ColumnInput {
  model_name: string;
  spec_sections?:
    | {
        sort_order: number;
        spec_items?: { label: string; value: string; sort_order: number }[] | null;
      }[]
    | null;
}

/** Model-identity rows: they already ride the dark bands above the table. */
const IDENTITY_ROW = /^model\s*(name|#|number)/i;

export function buildBroadbandSpecRows(
  columns: ColumnInput[],
  /** English label → this locale's, from `spec_label_translations`. */
  labels: Record<string, string> = {},
): BroadbandSpecRow[] {
  const rowOrder: string[] = [];
  const rowMap = new Map<string, Map<string, string>>();
  for (const p of columns) {
    for (const sec of [...(p.spec_sections ?? [])].sort((a, b) => a.sort_order - b.sort_order)) {
      for (const item of [...(sec.spec_items ?? [])].sort((a, b) => a.sort_order - b.sort_order)) {
        if (!rowMap.has(item.label)) {
          rowMap.set(item.label, new Map());
          rowOrder.push(item.label);
        }
        rowMap.get(item.label)!.set(p.model_name, item.value);
      }
    }
  }
  return rowOrder
    .map((label) => ({
      label,
      values: columns.map((p) => rowMap.get(label)?.get(p.model_name) ?? ""),
    }))
    .filter((r) => r.values.some((v) => v.trim() && v.trim().toUpperCase() !== "N/A"))
    .filter((r) => !IDENTITY_ROW.test(r.label.trim()))
    // Last, for the reasons at the top of this file. An empty translation is
    // not a translation — the editor stores one for every label, translated
    // or not.
    .map((r) => (labels[r.label]?.trim() ? { ...r, label: labels[r.label] } : r));
}
