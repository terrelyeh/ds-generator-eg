import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate, getCurrentUser } from "@eg/auth/session";
import { resolveMatrix } from "@/lib/project-datasheet/resolve";
import {
  findingId,
  scanDocument,
  storedFindingId,
  type Finding,
} from "@/lib/project-datasheet/gap-scan";
import { buildBrief, type BriefFinding } from "@/lib/project-datasheet/brief";
import type { BlankMode, DocRules } from "@/lib/project-datasheet/types";
import type {
  ProjectDatasheet,
  ProjectDatasheetModel,
  ProjectDatasheetQuestion,
} from "@eg/db/types";

/**
 * GET /api/projects/[id]/questions — rescan and reconcile.
 *
 * The scan is the source of truth for WHAT is wrong; the table is the source
 * of truth for what a human has done about it. Reconciling on read (rather
 * than on a save hook) means the list can never be stale relative to the
 * document — you edit a spec, reload, and the finding it fixed is gone.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await gate("project_datasheet.view");
  if (denied) return denied;

  const { id } = await params;
  const supabase = createAdminClient();

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
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const models = (modelRows ?? []) as ProjectDatasheetModel[];
  const stored = (questionRows ?? []) as ProjectDatasheetQuestion[];

  const rows = resolveMatrix({
    models,
    docRules: (doc.doc_rules ?? {}) as DocRules,
    blankPolicy: (doc.blank_policy as BlankMode) ?? "tbd",
  });
  const findings = scanDocument({ doc, models, rows });

  const byId = new Map(stored.map((q) => [storedFindingId(q), q]));
  const live = new Set(findings.map(findingId));

  // New findings, and ones that came back after being resolved.
  const inserts: Record<string, unknown>[] = [];
  const revivals: string[] = [];
  for (const f of findings) {
    const existing = byId.get(findingId(f));
    if (!existing) {
      inserts.push({
        project_datasheet_id: id,
        code: f.code,
        model_id: f.modelId,
        row_key: f.rowKey,
        title: f.title,
        detail: f.detail,
        asked_of: f.askedOf,
      });
    } else if (existing.state === "resolved") {
      revivals.push(existing.id);
    }
  }

  // Findings that no longer fire. Resolved, not deleted — the trail of what
  // was asked and how it settled is how a spec commitment gets defended six
  // months later.
  const resolved = stored
    .filter((q) => q.state !== "resolved" && !live.has(storedFindingId(q)))
    .map((q) => q.id);

  await Promise.all([
    inserts.length
      ? supabase.from("project_datasheet_questions").insert(inserts as never)
      : Promise.resolve(),
    revivals.length
      ? supabase
          .from("project_datasheet_questions")
          .update({ state: "open", updated_at: new Date().toISOString() })
          .in("id", revivals)
      : Promise.resolve(),
    resolved.length
      ? supabase
          .from("project_datasheet_questions")
          .update({ state: "resolved", updated_at: new Date().toISOString() })
          .in("id", resolved)
      : Promise.resolve(),
  ]);

  const { data: finalRows } = await supabase
    .from("project_datasheet_questions")
    .select("*")
    .eq("project_datasheet_id", id);
  const final = new Map(
    ((finalRows ?? []) as ProjectDatasheetQuestion[]).map((q) => [storedFindingId(q), q]),
  );

  // Severity and kind come from the scanner every time, never from the row —
  // a rule whose severity changes must not leave old rows carrying the old one.
  const merged: (BriefFinding & { id: string })[] = findings.map((f: Finding) => {
    const row = final.get(findingId(f));
    return {
      ...f,
      id: row?.id ?? "",
      state: (row?.state ?? "open") as BriefFinding["state"],
      answer: row?.answer ?? null,
    };
  });

  const openFindings = merged.filter((f) => f.state === "open");
  return NextResponse.json({
    findings: merged,
    counts: {
      open: openFindings.length,
      blocking: openFindings.filter((f) => f.severity === "blocking").length,
      advisory: openFindings.filter((f) => f.severity === "advisory").length,
      answered: merged.filter((f) => f.state === "answered").length,
    },
    brief: buildBrief({
      docName: doc.name,
      customer: doc.customer,
      findings: merged,
      date: new Date().toISOString().slice(0, 10),
    }),
  });
}

/** PATCH — record an answer, dismiss, or reopen one question. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await gate("project_datasheet.edit");
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    questionId?: string;
    state?: string;
    answer?: string;
  };
  if (!body.questionId) {
    return NextResponse.json({ error: "questionId is required" }, { status: 400 });
  }
  if (!body.state || !["open", "answered", "dismissed"].includes(body.state)) {
    return NextResponse.json({ error: "state must be open|answered|dismissed" }, { status: 400 });
  }
  if (body.state === "answered" && !body.answer?.trim()) {
    return NextResponse.json({ error: "an answer is required" }, { status: 400 });
  }

  const user = await getCurrentUser();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("project_datasheet_questions")
    .update({
      state: body.state,
      answer: body.state === "open" ? null : (body.answer?.trim() ?? null),
      answered_by: body.state === "open" ? null : (user?.id ?? null),
      answered_at: body.state === "open" ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.questionId)
    .eq("project_datasheet_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
