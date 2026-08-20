import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate, getCurrentUser } from "@eg/auth/session";
import { DEFAULT_LAYOUT, DEFAULT_IMAGE_NOTE, defaultDisclaimer } from "@/lib/project-datasheet/themes";

/**
 * POST /api/projects — create a project (tender) datasheet.
 *
 * Writes through the admin client because these tables are RLS
 * read-only for `authenticated`; `gate()` is the actual authorisation.
 */
export async function POST(request: Request) {
  const denied = await gate("project_datasheet.edit");
  if (denied) return denied;

  const user = await getCurrentUser();
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    customer?: string;
    layout?: string;
  };

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("project_datasheets")
    .insert({
      name,
      customer: body.customer?.trim() || null,
      layout: body.layout || DEFAULT_LAYOUT,
      disclaimer: defaultDisclaimer(),
      image_note: DEFAULT_IMAGE_NOTE,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
