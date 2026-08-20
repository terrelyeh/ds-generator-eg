import { notFound } from "next/navigation";
import { createClient } from "@eg/db/server";
import { requirePagePermission } from "@eg/auth/page-guards";
import { ProjectPreview } from "./project-preview";
import type { ProjectDatasheet, ProjectDatasheetModel } from "@eg/db/types";

/**
 * PROJECT / TENDER datasheet preview.
 *
 * Sits under `(print)` beside the catalogue previews so it inherits the same
 * bare print layout, but it shares nothing else with them: no product line,
 * no version row, no locale, no Drive folder. The document is assembled
 * entirely from `project_datasheets` + `project_datasheet_models`, which is
 * what keeps a tender draft structurally incapable of reaching sync or RAG.
 *
 * Gated even though it only renders. The catalogue previews are visible to
 * every whitelisted user because a datasheet for a shipping product is not
 * a secret; an unfinished quote for a named customer is.
 */
export default async function ProjectPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ toolbar?: string }>;
}) {
  await requirePagePermission("project_datasheet.view");

  const { id } = await params;
  const { toolbar } = await searchParams;

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

  const models = (modelRows ?? []) as ProjectDatasheetModel[];
  if (models.length === 0) notFound();

  return (
    <ProjectPreview doc={doc} models={models} showToolbar={toolbar !== "false"} />
  );
}
