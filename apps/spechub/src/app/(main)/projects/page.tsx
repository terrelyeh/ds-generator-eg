import { createClient } from "@eg/db/server";
import { requirePagePermission } from "@eg/auth/page-guards";
import { NewProjectButton } from "@/components/project/new-project-button";
import { ProjectList, type Issue } from "@/components/project/project-list";
import type { ProjectDatasheet } from "@eg/db/types";

export const dynamic = "force-dynamic";


/**
 * Tender Datasheets — the list of on-demand, non-catalogue datasheets.
 *
 * The route, the permission keys and the tables keep saying `project` — those
 * are contracts with bookmarks, the role matrix and the database, and renaming
 * them buys nothing a label change does not.
 *
 * Separate from /dashboard on purpose. The dashboard is the catalogue; these
 * are quotes for hardware that may never exist, and mixing them into the same
 * list is the first step towards someone treating one as the other.
 */
export default async function ProjectsPage() {
  await requirePagePermission("project_datasheet.view");

  const supabase = await createClient();
  const [{ data }, { data: issueRows }] = await Promise.all([
    supabase.from("project_datasheets").select("*").order("updated_at", { ascending: false }),
    // Every issue, not the latest per document: Postgres has no DISTINCT ON
    // through PostgREST, and the row count here is one per PDF ever printed
    // across a handful of deals. Reducing in JS is cheaper than a view.
    supabase
      .from("project_datasheet_issues")
      .select("project_datasheet_id, issue_no, issued_at, issued_by_email")
      .order("issue_no", { ascending: true }),
  ]);

  const docs = (data ?? []) as ProjectDatasheet[];
  const lastIssue = new Map<string, Issue>();
  for (const r of (issueRows ?? []) as Issue[]) lastIssue.set(r.project_datasheet_id, r);
  const live = docs.filter((d) => d.status !== "archived");
  const archived = docs.filter((d) => d.status === "archived");

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-8">
      <div className="mb-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-[#231f20]">
            Tender Datasheets
          </h1>
          {/* The paragraph that used to sit here is gone. A list page is
              scanned, not read: four lines of explanation above the rows are
              in the way every single visit, and everything they said is one
              click away in the guide — which is what the link is for. */}
          <a
            href="/docs/tender-datasheets.html"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-sm text-engenius-blue hover:underline"
          >
            這是什麼、三種情境與完整流程 →
          </a>
        </div>
        <NewProjectButton />
      </div>

      {docs.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          還沒有任何標案 datasheet。
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          <ProjectList docs={live} lastIssue={lastIssue} />
          {archived.length > 0 && (
            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                已封存
              </h2>
              <ProjectList docs={archived} lastIssue={lastIssue} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
