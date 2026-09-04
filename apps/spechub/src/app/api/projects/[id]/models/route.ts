import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { demoteIfBlocked } from "@/lib/project-datasheet/blockers";
import { gate } from "@eg/auth/session";

/** Column fields the editor may write. */
const MODEL_FIELDS = [
  "position",
  "model_name",
  "display_name",
  "subtitle",
  "overview",
  "features",
  "images",
  "raw_doc",
  "rules",
] as const;

/** POST /api/projects/[id]/models — add a column. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await gate("project_datasheet.edit");
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { model_name?: string };
  const modelName = body.model_name?.trim();
  if (!modelName) {
    return NextResponse.json({ error: "model_name is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { count } = await supabase
    .from("project_datasheet_models")
    .select("id", { count: "exact", head: true })
    .eq("project_datasheet_id", id);

  const { data, error } = await supabase
    .from("project_datasheet_models")
    .insert({
      project_datasheet_id: id,
      model_name: modelName,
      position: count ?? 0,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id, ...(await demoteIfBlocked(supabase, id)) });
}

/** PATCH /api/projects/[id]/models — update one column (`id` in the body). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await gate("project_datasheet.edit");
  if (denied) return denied;

  const { id: docId } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const modelId = typeof body.id === "string" ? body.id : null;
  if (!modelId) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  for (const f of MODEL_FIELDS) {
    if (f in body) patch[f] = body[f];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const supabase = createAdminClient();
  // Scoped by parent as well as id — the document id is in the URL, so a
  // mismatched pair is a bug or a probe, and either way shouldn't write.
  const { error } = await supabase
    .from("project_datasheet_models")
    .update(patch)
    .eq("id", modelId)
    .eq("project_datasheet_id", docId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...(await demoteIfBlocked(supabase, docId)) });
}

/** DELETE /api/projects/[id]/models — remove one column (`id` in the body). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await gate("project_datasheet.edit");
  if (denied) return denied;

  const { id: docId } = await params;
  const body = (await request.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("project_datasheet_models")
    .delete()
    .eq("id", body.id)
    .eq("project_datasheet_id", docId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...(await demoteIfBlocked(supabase, docId)) });
}
