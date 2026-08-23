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

type Issue = {
  project_datasheet_id: string;
  issue_no: number;
  issued_at: string;
  issued_by_email: string | null;
};

const day = (iso: string) => iso.slice(0, 10).replace(/-/g, "/");

/**
 * Column widths live here so the header and the rows cannot drift apart.
 * A header that no longer sits over its column is worse than no header.
 */
const COL = {
  branch: "w-[72px]",
  customer: "w-[200px]",
  status: "w-[64px]",
  tender: "w-[76px]",
  pdf: "w-[168px]",
  actions: "w-[136px]",
} as const;

function ProjectList({
  docs,
  lastIssue,
}: {
  docs: ProjectDatasheet[];
  lastIssue: Map<string, Issue>;
}) {
  if (docs.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-lg border">
      {/* A header, because five unlabelled columns of grey text is a puzzle.
          "尚未出圖" in particular said nothing on its own — under 最後產生的
          PDF it needs no explaining. */}
      <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-2 text-[11px] font-medium tracking-wide text-muted-foreground">
        <span className={`${COL.branch} shrink-0`}>分公司</span>
        <span className="min-w-0 flex-1">文件</span>
        <span className={`${COL.customer} shrink-0`}>客戶</span>
        <span className={`${COL.status} shrink-0`}>狀態</span>
        <span className={`${COL.tender} shrink-0`}>標案時間</span>
        <span className={`${COL.pdf} shrink-0`}>最後產生的 PDF</span>
        <span className={`${COL.actions} shrink-0`} />
      </div>

      <ul className="divide-y">
        {docs.map((d) => {
          const issue = lastIssue.get(d.id);
          const stale = issue ? new Date(d.updated_at) > new Date(issue.issued_at) : false;
          return (
            <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className={`${COL.branch} shrink-0`}>
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

              <span className={`${COL.customer} shrink-0 truncate text-xs text-muted-foreground`}>
                {d.customer}
              </span>

              <span className={`${COL.status} shrink-0 text-xs text-muted-foreground`}>
                {STATUS_LABEL[d.status] ?? d.status}
              </span>

              <span className={`${COL.tender} shrink-0 text-xs text-muted-foreground`}>
                {d.tender_date}
              </span>

              {/* The one column that earns emphasis: it is the only thing here
                  that says something left the building. */}
              <span className={`${COL.pdf} shrink-0 text-xs tabular-nums`}>
                {issue ? (
                  <>
                    <span className="text-[#231f20]">
                      {day(issue.issued_at)}
                      <span className="ml-1 text-muted-foreground">第 {issue.issue_no} 版</span>
                    </span>
                    {stale && <span className="ml-1.5 text-[#b45309]">產生後又改過</span>}
                  </>
                ) : (
                  <span className="text-muted-foreground">還沒產生過</span>
                )}
              </span>

              <span
                className={`${COL.actions} flex shrink-0 items-center justify-end gap-3 text-xs`}
              >
                <Link href={`/projects/${d.id}`} className="text-engenius-blue hover:underline">
                  編輯
                </Link>
                <Link
                  href={`/preview/project/${d.id}`}
                  target="_blank"
                  className="text-engenius-blue hover:underline"
                >
                  預覽
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
    </div>
  );
}
