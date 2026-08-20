import { notFound } from "next/navigation";
import { createClient } from "@eg/db/server";
import { requirePagePermission } from "@eg/auth/page-guards";
import { ProjectEditor } from "@/components/project/project-editor";
import type { ProjectDatasheet, ProjectDatasheetModel } from "@eg/db/types";

export const dynamic = "force-dynamic";

export default async function ProjectEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission("project_datasheet.edit");

  const { id } = await params;
  const supabase = await createClient();

  const [{ data: docRow }, { data: modelRows }] = await Promise.all([
    supabase.from("project_datasheets").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("project_datasheet_models")
      .select("*")
      .eq("project_datasheet_id", id)
      .order("position"),
  ]);

  const doc = docRow as ProjectDatasheet | null;
  if (!doc) notFound();

  return (
    // 15% larger all round — `zoom` scales layout AND type together, which is
    // what "wider, with the text to match" means; bumping max-width alone just
    // spreads the same small text over more page.
    <div className="mx-auto max-w-[1000px] px-6 py-8" style={{ zoom: 1.15 }}>
      <ProjectEditor doc={doc} models={(modelRows ?? []) as ProjectDatasheetModel[]} />
    </div>
  );
}
