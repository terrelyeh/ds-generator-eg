import { createAdminClient } from "@eg/db/admin";
import { logIfDbError } from "@eg/db/errors";
import { resolveMatrix } from "./resolve";
import { scanDocument, storedFindingId } from "./gap-scan";
import type { BlankMode, DocRules } from "./types";
import type {
  ProjectDatasheet,
  ProjectDatasheetModel,
  ProjectDatasheetQuestion,
} from "@eg/db/types";

/**
 * Send a Ready document back to Draft if a write has given it a blocker.
 *
 * "Ready" was checked once, at the moment of the transition, and never again:
 * add a model, apply an extraction, dismiss then un-dismiss a question, and
 * the document kept its Ready badge with a finding open that would make it
 * wrong. Every route that changes what the gap review sees calls this on
 * its way out and returns the result, so the client can say why the badge
 * moved. A document that is not Ready is left alone.
 */
export async function demoteIfBlocked(
  supabase: ReturnType<typeof createAdminClient>,
  id: string,
): Promise<{ demoted: boolean; blockers: string[] }> {
  const { data } = await supabase
    .from("project_datasheets")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if ((data as { status?: string } | null)?.status !== "ready") {
    return { demoted: false, blockers: [] };
  }
  const blockers = await openBlockers(supabase, id);
  if (blockers.length === 0) return { demoted: false, blockers: [] };
  const ok = logIfDbError(
    `project ${id} demote ready→draft`,
    await supabase
      .from("project_datasheets")
      .update({ status: "draft", updated_at: new Date().toISOString() })
      .eq("id", id),
  );
  return { demoted: ok, blockers };
}

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
