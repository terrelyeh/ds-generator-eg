import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate } from "@eg/auth/session";
import { PROJECT_LAYOUTS } from "@/lib/project-datasheet/themes";

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
  "image_note",
  "sections",
  "blank_policy",
  "doc_rules",
  "notes",
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
  const { error } = await supabase.from("project_datasheets").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/projects/[id] — models and sources cascade. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await gate("project_datasheet.edit");
  if (denied) return denied;

  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from("project_datasheets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
