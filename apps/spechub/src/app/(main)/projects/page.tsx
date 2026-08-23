import Link from "next/link";
import { createClient } from "@eg/db/server";
import { requirePagePermission } from "@eg/auth/page-guards";
import { NewProjectButton } from "@/components/project/new-project-button";
import { ProjectRowActions } from "@/components/project/project-row-actions";
import type { ProjectDatasheet } from "@eg/db/types";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  ready: "可以送出",
  archived: "已封存",
};

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
          <p className="mt-1 max-w-[760px] text-sm text-muted-foreground">
            Preliminary datasheets for the bids we do not have a catalogue
            product for — retarget a supplier&apos;s spec sheet onto EnGenius
            naming and layout, or extend one of our own models with what the
            tender asks for. These live outside the product catalogue: never
            synced, never indexed, never products. When a customer commits, the
            line gets built properly in Google Sheets.
          </p>
          {/* Right under the paragraph that explains what this is, because
              that is where somebody reading it decides they want more. */}
          <a
            href="/docs/tender-datasheets.html"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm text-engenius-blue hover:underline"
          >
            三種情境與完整流程 →
          </a>
        </div>
        <NewProjectButton />
      </div>

      {docs.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No project datasheets yet.
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          <ProjectList docs={live} lastIssue={lastIssue} />
          {archived.length > 0 && (
            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Archived
              </h2>
              <ProjectList docs={archived} lastIssue={lastIssue} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Issue = {
  project_datasheet_id: string;
  issue_no: number;
  issued_at: string;
  issued_by_email: string | null;
};

const day = (iso: string) => iso.slice(0, 10).replace(/-/g, "/");

function ProjectList({
  docs,
  lastIssue,
}: {
  docs: ProjectDatasheet[];
  lastIssue: Map<string, Issue>;
}) {
  if (docs.length === 0) return null;
  return (
    <ul className="divide-y rounded-lg border">
      {docs.map((d) => {
        const issue = lastIssue.get(d.id);
        const stale = issue ? new Date(d.updated_at) > new Date(issue.issued_at) : false;
        return (
          <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            {/* One line, read left to right: whose deal, what it is, who for,
                where it stands, when it last went out. The hierarchy is
                carried by weight and colour rather than by a second row —
                twelve deals on two lines each is a page nobody scans. */}
            <span className="w-[72px] shrink-0">
              {d.branch && (
                <span className="inline-block rounded bg-[#eef2f7] px-1.5 py-0.5 text-xs font-medium text-[#1b3a5c]">
                  {d.branch}
                </span>
              )}
            </span>

            <Link
              href={`/projects/${d.id}`}
              className="min-w-0 flex-1 truncate font-medium text-[#231f20] hover:text-engenius-blue"
            >
              {d.name}
            </Link>

            <span className="w-[200px] shrink-0 truncate text-xs text-muted-foreground">
              {d.customer}
            </span>

            <span className="w-[64px] shrink-0 text-xs text-muted-foreground">
              {STATUS_LABEL[d.status] ?? d.status}
            </span>

            <span className="w-[76px] shrink-0 text-xs text-muted-foreground">
              {d.tender_date && `標案 ${d.tender_date}`}
            </span>

            {/* The one column that earns emphasis: it is the only thing here
                that says something left the building. */}
            <span className="w-[150px] shrink-0 text-xs tabular-nums">
              {issue ? (
                <>
                  <span className="text-[#231f20]">
                    出圖 {day(issue.issued_at)}
                    <span className="ml-1 text-muted-foreground">第 {issue.issue_no} 版</span>
                  </span>
                  {stale && <span className="ml-1.5 text-[#b45309]">已改過</span>}
                </>
              ) : (
                <span className="text-muted-foreground">尚未出圖</span>
              )}
            </span>

            <span className="flex shrink-0 items-center gap-3 text-xs">
              <Link href={`/projects/${d.id}`} className="text-engenius-blue hover:underline">
                Edit
              </Link>
              <Link
                href={`/preview/project/${d.id}`}
                target="_blank"
                className="text-engenius-blue hover:underline"
              >
                Preview
              </Link>
              <ProjectRowActions
                id={d.id}
                name={d.name}
                archived={d.status === "archived"}
                issued={!!issue}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
