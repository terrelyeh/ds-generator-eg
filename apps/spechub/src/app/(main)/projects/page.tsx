import Link from "next/link";
import { createClient } from "@eg/db/server";
import { requirePagePermission } from "@eg/auth/page-guards";
import { NewProjectButton } from "@/components/project/new-project-button";
import type { ProjectDatasheet } from "@eg/db/types";

export const dynamic = "force-dynamic";

/** Deal stage, which is not the same thing as document status. */
const DEAL_STAGE: Record<string, string> = {
  inquiry: "洽談中",
  quoted: "已報價",
  waiting: "等客戶",
  won: "拿到",
  lost: "沒拿到",
};

/**
 * Project Datasheet Builder — the list of on-demand project datasheets.
 *
 * Separate from /dashboard on purpose. The dashboard is the catalogue; these
 * are quotes for hardware that may never exist, and mixing them into the same
 * list is the first step towards someone treating one as the other.
 */
export default async function ProjectsPage() {
  await requirePagePermission("project_datasheet.view");

  const supabase = await createClient();
  const { data } = await supabase
    .from("project_datasheets")
    .select("*")
    .order("updated_at", { ascending: false });

  const docs = (data ?? []) as ProjectDatasheet[];
  const live = docs.filter((d) => d.status !== "archived");
  const archived = docs.filter((d) => d.status === "archived");

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-8">
      <div className="mb-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-[#231f20]">
            Project Datasheet Builder
          </h1>
          <p className="mt-1 max-w-[620px] text-sm text-muted-foreground">
            Preliminary datasheets for project business — retarget a supplier
            spec sheet onto EnGenius naming and layout to quote a tender. These
            live outside the product catalogue: they are never synced, never
            indexed, and never become products. When a customer commits, the
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
          <ProjectList docs={live} />
          {archived.length > 0 && (
            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Archived
              </h2>
              <ProjectList docs={archived} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectList({ docs }: { docs: ProjectDatasheet[] }) {
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
                None of this reaches the PDF. */}
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {d.customer && <span>{d.customer}</span>}
              {d.branch && <span>{d.branch}</span>}
              {d.sales_owner && <span>{d.sales_owner}</span>}
              {d.est_quantity && <span className="tabular-nums">{d.est_quantity}</span>}
              <span className="rounded bg-muted px-1.5 py-0.5 uppercase tracking-wide">
                {d.status}
              </span>
              {DEAL_STAGE[d.deal_stage] && (
                <span
                  className={`rounded px-1.5 py-0.5 ${
                    d.deal_stage === "won"
                      ? "bg-emerald-100 text-emerald-800"
                      : d.deal_stage === "lost"
                        ? "bg-muted"
                        : "bg-sky-100 text-sky-800"
                  }`}
                >
                  {DEAL_STAGE[d.deal_stage]}
                </span>
              )}
              {d.due_date && (
                <span className="tabular-nums">期限 {d.due_date}</span>
              )}
              <span className="tabular-nums">
                更新 {new Date(d.updated_at).toISOString().slice(0, 10)}
              </span>
            </div>
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
          </div>
        </li>
      ))}
    </ul>
  );
}
