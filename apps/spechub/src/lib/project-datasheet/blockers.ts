import { createAdminClient } from "@eg/db/admin";
import { resolveMatrix } from "./resolve";
import { scanDocument, storedFindingId } from "./gap-scan";
import type { BlankMode, DocRules } from "./types";
import type {
  ProjectDatasheet,
  ProjectDatasheetModel,
  ProjectDatasheetQuestion,
} from "@eg/db/types";

/**
 * Titles of the blocking findings still open on this document.
 *
 * Rescans rather than trusting stored rows: severity lives in the scanner, so
 * a question answered against an older version of a rule should not keep a
 * document unblocked after the rule tightened.
 */
export async function openBlockers(
  supabase: ReturnType<typeof createAdminClient>,
  id: string,
): Promise<string[]> {
  const [{ data: docRow }, { data: modelRows }, { data: questionRows }] = await Promise.all([
    supabase.from("project_datasheets").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("project_datasheet_models")
      .select("*")
      .eq("project_datasheet_id", id)
      .order("position"),
    supabase.from("project_datasheet_questions").select("*").eq("project_datasheet_id", id),
  ]);

  const doc = docRow as ProjectDatasheet | null;
  if (!doc) return [];
  const models = (modelRows ?? []) as ProjectDatasheetModel[];

  const rows = resolveMatrix({
    models,
    docRules: (doc.doc_rules ?? {}) as DocRules,
    blankPolicy: (doc.blank_policy as BlankMode) ?? "tbd",
  });

  // The gate has to see exactly what the review sees. Scanning with less
  // context here would let a document through on a finding the panel is
  // still showing — the worst possible disagreement between the two.
  const { data: sourceRows } = await supabase
    .from("project_datasheet_sources")
    .select("id, kind, extracted_text")
    .eq("project_datasheet_id", id);
  const sources = (sourceRows ?? []) as {
    id: string;
    kind: string;
    extracted_text: string | null;
  }[];
  const sourceText = sources
    .filter((s) => s.kind !== "requirements" && s.extracted_text)
    .map((s) => s.extracted_text as string)
    .join("\n\n");
  const catalogIds = new Set(sources.filter((s) => s.kind === "catalog").map((s) => s.id));
  const catalogModels = new Set(
    models.filter((m) => m.source_id && catalogIds.has(m.source_id)).map((m) => m.id),
  );

  // Anything a human has answered or dismissed is settled, whatever the
  // scanner still says about it — the point of answering is to move on.
  const settled = new Set(
    ((questionRows ?? []) as ProjectDatasheetQuestion[])
      .filter((q) => q.state === "answered" || q.state === "dismissed")
      .map(storedFindingId),
  );

  return scanDocument({ doc, models, rows, sourceText, catalogModels })
    .filter((f) => f.severity === "blocking")
    .filter((f) => !settled.has(`${f.code}|${f.modelId ?? ""}|${f.rowKey ?? ""}`))
    .map((f) => f.title);
}
