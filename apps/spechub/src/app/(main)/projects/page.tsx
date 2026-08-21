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
    <div className="mx-auto max-w-[1000px] px-6 py-8">
      <div className="mb-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-[#231f20]">
            Tender Datasheets
          </h1>
          <p className="mt-1 max-w-[620px] text-sm text-muted-foreground">
            Preliminary datasheets for the bids we do not have a catalogue
            product for — retarget a supplier&apos;s spec sheet onto EnGenius
            naming and layout, or extend one of our own models with what the
            tender asks for. These live outside the product catalogue: never
            synced, never indexed, never products. When a customer commits, the
            line gets built properly in Google Sheets.
          </p>
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
      {docs.map((d) => (
        <li key={d.id} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <Link
              href={`/projects/${d.id}`}
              className="font-medium text-[#231f20] hover:text-engenius-blue"
            >
              {d.name}
            </Link>
            {/* Internal context, so a list of a dozen deals stays legible.
                None of this reaches the PDF.

                The branch gets its own chip rather than sitting in the row of
                grey text with the customer and the owner: it is the field
                people scan this list by, and three interchangeable grey words
                are not scannable. */}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {d.branch && (
                <span className="rounded bg-[#eef2f7] px-1.5 py-0.5 font-medium text-[#1b3a5c]">
                  {d.branch}
                </span>
              )}
              <span className="rounded bg-muted px-1.5 py-0.5 uppercase tracking-wide">
                {STATUS_LABEL[d.status] ?? d.status}
              </span>
              {d.customer && <span>{d.customer}</span>}
              {d.sales_owner && <span>{d.sales_owner}</span>}
              {d.tender_date && <span>標案 {d.tender_date}</span>}
            </div>
          </div>
          {/* When a PDF was last made, and whether the document has moved
              since. `updated_at` alone answered neither: it shifts when
              somebody fixes an internal note, so it never meant "sent". */}
          <div className="shrink-0 text-right text-xs">
            {(() => {
              const issue = lastIssue.get(d.id);
              if (!issue) {
                return <span className="text-muted-foreground">尚未出圖</span>;
              }
              const stale = new Date(d.updated_at) > new Date(issue.issued_at);
              return (
                <div className="space-y-0.5">
                  <div className="font-medium tabular-nums text-[#231f20]">
                    出圖 {day(issue.issued_at)}
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      第 {issue.issue_no} 版
                    </span>
                  </div>
                  {stale ? (
                    <div className="text-[#b45309]">出圖後又改過</div>
                  ) : (
                    issue.issued_by_email && (
                      <div className="text-muted-foreground">{issue.issued_by_email}</div>
                    )
                  )}
                </div>
              );
            })()}
          </div>

          <div className="flex shrink-0 items-center gap-3 text-sm">
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
              issued={lastIssue.has(d.id)}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
