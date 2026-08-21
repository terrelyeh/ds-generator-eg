import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate } from "@eg/auth/session";
import { PROJECT_LAYOUTS } from "@/lib/project-datasheet/themes";
import { resolveMatrix } from "@/lib/project-datasheet/resolve";
import { scanDocument, storedFindingId } from "@/lib/project-datasheet/gap-scan";
import type { BlankMode, DocRules } from "@/lib/project-datasheet/types";
import type {
  ProjectDatasheet,
  ProjectDatasheetModel,
  ProjectDatasheetQuestion,
} from "@eg/db/types";

/** Document fields the editor may write. Anything else is ignored. */
const DOC_FIELDS = [
  "name",
  "customer",
  "status",
  "layout",
  "headline",
  "series_name",
  "category_label",
  "overview",
  "features",
  "footnote",
  "images",
  "disclaimer",
  "confidentiality",
  "image_note",
  "diagram_title",
  "diagram_note",
  "sections",
  "blank_policy",
  "doc_rules",
  "notes",
  // Internal deal context. Writable here, never read by the renderer.
  "branch",
  "sales_owner",
  "opportunity",
  "tender_date",
] as const;

/** PATCH /api/projects/[id] — update the document. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await gate("project_datasheet.edit");
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const patch: Record<string, unknown> = {};
  for (const f of DOC_FIELDS) {
    if (f in body) patch[f] = body[f];
  }

  // The DB check would reject a blank disclaimer anyway, but a 500 from a
  // constraint violation tells the user nothing. The notice is the one field
  // where "the save failed" needs to explain itself.
  if ("disclaimer" in patch) {
    const d = typeof patch.disclaimer === "string" ? patch.disclaimer.trim() : "";
    if (!d) {
      return NextResponse.json(
        {
          error:
            "The PRELIMINARY notice cannot be empty. Reword it if you need to, " +
            "but a project datasheet always carries one.",
        },
        { status: 400 },
      );
    }
    patch.disclaimer = d;
  }

  if ("layout" in patch && !PROJECT_LAYOUTS[String(patch.layout)]) {
    return NextResponse.json({ error: `unknown layout: ${patch.layout}` }, { status: 400 });
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const supabase = createAdminClient();

  // "Ready to send" has to be earned. Without this the gap review is advice,
  // and advice about a document that is already out the door is worth
  // nothing. Incompleteness never blocks — TBD is honest in a preliminary
  // sheet — so what stands in the way is only the set of things that would
  // make the document WRONG: a number nobody sourced, a spec that
  // contradicts itself, a term we said we had removed.
  if (patch.status === "ready") {
    const blockers = await openBlockers(supabase, id);
    if (blockers.length > 0) {
      return NextResponse.json(
        {
          error:
            `還有 ${blockers.length} 項未確認的問題會讓這份文件出錯，先處理完才能標成 Ready：\n` +
            blockers.slice(0, 5).map((b) => `· ${b}`).join("\n") +
            (blockers.length > 5 ? `\n· …還有 ${blockers.length - 5} 項` : ""),
        },
        { status: 409 },
      );
    }
  }
  const { error } = await supabase.from("project_datasheets").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * Titles of the blocking findings still open on this document.
 *
 * Rescans rather than trusting stored rows: severity lives in the scanner, so
 * a question answered against an older version of a rule should not keep a
 * document unblocked after the rule tightened.
 */
async function openBlockers(
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

/**
 * DELETE /api/projects/[id] — models, sources and issues cascade.
 *
 * ⚠️ Refused once the document has been issued. The issues table is the record
 * of what a customer was actually shown (00047), and the cascade would take it
 * with the document — quietly, and precisely for the sheets where it matters.
 * Hard delete is for a row somebody created by accident; a sheet that went out
 * gets archived, which is what `status = archived` is for.
 *
 * Storage objects are left alone, as elsewhere in this module: an orphaned
 * image costs nothing and a URL can still be referenced by a duplicate.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await gate("project_datasheet.edit");
  if (denied) return denied;

  const { id } = await params;
  const supabase = createAdminClient();

  const { count } = await supabase
    .from("project_datasheet_issues")
    .select("id", { count: "exact", head: true })
    .eq("project_datasheet_id", id);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          `這份文件已經出過 ${count} 版 PDF，刪掉會連同「客戶手上那份長什麼樣」的存檔一起消失。` +
          `不要用的話請改成封存。`,
      },
      { status: 409 },
    );
  }

  const { error } = await supabase.from("project_datasheets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
