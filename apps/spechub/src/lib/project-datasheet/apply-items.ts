/**
 * Applying a set of proposed items to a project datasheet.
 *
 * Shared by the two things that propose: requirements intake (a note from
 * sales) and answers to gap-review questions. They are the same act — a
 * human read something, ticked what it implies, and now the document should
 * change — so they must not drift into two subtly different merge rules.
 *
 * Everything here MERGES. Proposals are reviewed and applied minutes or days
 * apart from hand edits made in the same fields, and an apply that replaced
 * `doc_rules` wholesale would silently undo whatever was typed in between.
 */

import type { createAdminClient } from "@eg/db/admin";
import { asRules, normalizeKey } from "./resolve";
import type { IntakeItem } from "./intake";
import type { SpecRules } from "./types";
import type { ProjectDatasheet, ProjectDatasheetModel } from "@eg/db/types";

export interface ApplyResult {
  applied: number;
  questions: number;
}

export async function applyItems(
  supabase: ReturnType<typeof createAdminClient>,
  docId: string,
  doc: ProjectDatasheet,
  models: ProjectDatasheetModel[],
  items: IntakeItem[],
): Promise<ApplyResult> {
  const docRules = asRules(doc.doc_rules) as SpecRules;
  const hide = new Set(docRules.hide ?? []);
  const override = { ...(docRules.override ?? {}) };
  const docPatch: Record<string, unknown> = {};

  const modelPatches = new Map<string, SpecRules>();
  const rulesFor = (name: string): SpecRules | null => {
    const model = models.find((m) => m.model_name === name);
    if (!model) return null;
    if (!modelPatches.has(model.id)) {
      modelPatches.set(model.id, asRules(model.rules) as SpecRules);
    }
    return modelPatches.get(model.id)!;
  };

  const questions: Record<string, unknown>[] = [];

  for (const item of items) {
    switch (item.type) {
      case "doc_hide":
        hide.add(item.key);
        break;
      case "doc_override":
        override[item.key] = item.value;
        break;
      case "doc_field":
        docPatch[item.field] = item.value;
        break;
      case "model_hide": {
        const r = rulesFor(item.modelName);
        if (r) r.hide = [...new Set([...(r.hide ?? []), item.key])];
        break;
      }
      case "model_override": {
        const r = rulesFor(item.modelName);
        if (r) r.override = { ...(r.override ?? {}), [item.key]: item.value };
        break;
      }
      case "model_blank": {
        const r = rulesFor(item.modelName);
        if (!r) break;
        r.blank = { ...(r.blank ?? {}), [item.key]: item.mode };
        // A stale override would win over the blank mode and the cell would
        // keep printing the old value, so the two have to move together.
        if (r.override && item.key in r.override) {
          const next = { ...r.override };
          delete next[item.key];
          r.override = next;
        }
        break;
      }
      case "model_add": {
        const r = rulesFor(item.modelName);
        if (!r) break;
        r.add = [
          ...(r.add ?? []).filter((a) => (a.key || normalizeKey(a.label)) !== item.key),
          { key: item.key, label: item.label, value: item.value, after: item.after ?? null },
        ];
        break;
      }
      case "question":
        questions.push({
          project_datasheet_id: docId,
          // Namespaced so the gap scanner never resolves it away — a question
          // a person raised is not a finding a check can decide is fixed.
          code: `intake:${normalizeKey(item.title).slice(0, 60)}`,
          model_id: null,
          row_key: null,
          title: item.title,
          detail: item.detail || item.because,
          asked_of: item.askedOf,
        });
        break;
    }
  }

  docPatch.doc_rules = { ...docRules, hide: [...hide], override };
  docPatch.updated_at = new Date().toISOString();

  const writes: PromiseLike<unknown>[] = [
    supabase.from("project_datasheets").update(docPatch as never).eq("id", docId),
    ...[...modelPatches].map(([modelId, rules]) =>
      supabase
        .from("project_datasheet_models")
        .update({ rules: rules as never, updated_at: new Date().toISOString() })
        .eq("id", modelId),
    ),
  ];

  let inserted = 0;
  if (questions.length) {
    // Filtered by hand rather than upserted: the identity index is an
    // EXPRESSION index (it coalesces the nullable columns), so PostgREST's
    // `onConflict` — which takes a column list — cannot name it.
    const { data: existing } = await supabase
      .from("project_datasheet_questions")
      .select("code")
      .eq("project_datasheet_id", docId);
    const seen = new Set(((existing ?? []) as { code: string }[]).map((q) => q.code));
    const fresh = questions.filter((q) => !seen.has(q.code as string));
    inserted = fresh.length;
    if (fresh.length) {
      writes.push(supabase.from("project_datasheet_questions").insert(fresh as never));
    }
  }

  await Promise.all(writes);
  return { applied: items.length, questions: inserted };
}
