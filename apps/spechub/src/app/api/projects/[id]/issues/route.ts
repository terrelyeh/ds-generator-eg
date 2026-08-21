import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate, getCurrentUser } from "@eg/auth/session";
import type { ProjectDatasheet, ProjectDatasheetModel } from "@eg/db/types";

/**
 * POST /api/projects/[id]/issues — record what is about to be printed.
 * GET  /api/projects/[id]/issues — the history, newest first (no snapshots).
 *
 * The tender sheet prints through the browser, so nothing else in the system
 * knows a PDF was made. The print button calls this first, which is what makes
 * "last issued" a real date rather than `updated_at` moving because someone
 * fixed a typo in an internal note.
 *
 * ⚠️ The snapshot is the RESOLVED document — the same `{doc, models}` the
 * renderer takes as props — not ids pointing at live rows. The spec table is
 * `raw_doc ⊕ rules` computed at render time, so a snapshot made of foreign
 * keys would quietly change every time someone edited a rule. Six weeks later
 * "what did we send them" has to answer with what they saw, not with what the
 * document happens to say today.
 *
 * Not bulletproof: Cmd+P bypasses the button entirely. That is why the list
 * also flags a document edited since its last issue — a stale flag is a more
 * honest signal than a date that pretends to be complete.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await gate("project_datasheet.edit");
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { note?: string };
  const user = await getCurrentUser();
  const supabase = createAdminClient();

  const [{ data: doc }, { data: models }] = await Promise.all([
    supabase.from("project_datasheets").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("project_datasheet_models")
      .select("*")
      .eq("project_datasheet_id", id)
      .order("position", { ascending: true }),
  ]);
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const snapshot = {
    doc: doc as ProjectDatasheet,
    models: (models ?? []) as ProjectDatasheetModel[],
  };

  // Read-then-write rather than a sequence: the number is per document because
  // "issue 3 of this deal" is what someone says out loud. Two people printing
  // the same second would collide on the unique index; that is a retry, not a
  // silent second row sharing a number.
  const { data: last } = await supabase
    .from("project_datasheet_issues")
    .select("issue_no")
    .eq("project_datasheet_id", id)
    .order("issue_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  const issueNo = ((last as { issue_no: number } | null)?.issue_no ?? 0) + 1;

  const { data: created, error } = await supabase
    .from("project_datasheet_issues")
    .insert({
      project_datasheet_id: id,
      issue_no: issueNo,
      issued_by: user?.id ?? null,
      issued_by_email: user?.email ?? null,
      note: body.note?.trim() || null,
      snapshot: snapshot as never,
    })
    .select("id, issue_no, issued_at, issued_by_email, note")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ issue: created });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await gate("project_datasheet.view");
  if (denied) return denied;

  const { id } = await params;
  const supabase = createAdminClient();

  // Snapshots are whole documents; a history list that carried them would be
  // megabytes to render a handful of dates.
  const { data, error } = await supabase
    .from("project_datasheet_issues")
    .select("id, issue_no, issued_at, issued_by_email, note")
    .eq("project_datasheet_id", id)
    .order("issue_no", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ issues: data ?? [] });
}
