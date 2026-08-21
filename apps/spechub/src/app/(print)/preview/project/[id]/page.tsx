import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@eg/db/server";
import { createAdminClient } from "@eg/db/admin";
import { requirePagePermission } from "@eg/auth/page-guards";
import { ProjectPreview } from "./project-preview";
import { printTitle } from "@/lib/project-datasheet/filename";
import { openBlockers } from "@/lib/project-datasheet/blockers";
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
 *
 * The gate stands aside for the internal automation bypass, the same header
 * `proxy.ts` already trusts for Puppeteer's self-fetch. A page guard that
 * server-side rendering cannot get past would make this the one datasheet
 * that can never be produced headlessly — and the redirect would be silent,
 * printing /dashboard as the "PDF".
 *
 * Waiving the gate is not enough on its own: a bypassed request carries no
 * session, so RLS ("authenticated may select") returns nothing and the page
 * 404s. The automation path therefore reads through the service-role client.
 * RLS stays strict — anon still cannot read a tender draft — and the trusted
 * header is the only thing that opens the door, which is the same trust
 * boundary the proxy already draws rather than a second one.
 */
/**
 * The browser uses this as the suggested filename for "Save as PDF".
 *
 * Read through the ordinary server client, not the admin one: RLS keeps a
 * tender draft's name out of a page title for anyone who could not open the
 * document anyway. A request that cannot read it gets the generic title,
 * which is the right amount to tell them.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("project_datasheets")
      .select("name")
      .eq("id", id)
      .maybeSingle();
    const doc = data as Pick<ProjectDatasheet, "name"> | null;
    if (doc?.name) return { title: printTitle(doc, new Date()) };
  } catch {
    // A title is not worth failing a page render over.
  }
  return { title: "Project datasheet" };
}

export default async function ProjectPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ toolbar?: string }>;
}) {
  const automationSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const isAutomation =
    !!automationSecret &&
    (await headers()).get("x-vercel-protection-bypass") === automationSecret;
  if (!isAutomation) await requirePagePermission("project_datasheet.view");

  const { id } = await params;
  const { toolbar } = await searchParams;

  const supabase = isAutomation ? createAdminClient() : await createClient();

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

  const showToolbar = toolbar !== "false";

  /**
   * Only when somebody is looking. The scan costs two more queries, and the
   * path that skips the toolbar is the PDF renderer, which has nobody to warn.
   */
  const blockers = showToolbar ? (await openBlockers(createAdminClient(), id)).length : 0;

  return (
    <ProjectPreview
      doc={doc}
      models={models}
      showToolbar={showToolbar}
      blockers={blockers}
    />
  );
}
