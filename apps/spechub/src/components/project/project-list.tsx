import Link from "next/link";
import { ProjectRowActions } from "@/components/project/project-row-actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProjectDatasheet } from "@eg/db/types";

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  ready: "可以送出",
  archived: "已封存",
};

export type Issue = {
  project_datasheet_id: string;
  issue_no: number;
  issued_at: string;
  issued_by_email: string | null;
};

const day = (iso: string) => iso.slice(0, 10).replace(/-/g, "/");

/**
 * Doc-level pictures, split the way the layout uses them: the first is the
 * architecture diagram on page 2 and the rest are the scenario vignettes
 * after the specs. Same split as `project-preview` — see `diagrams.slice(1)`.
 */
function diagramCounts(images: unknown): { hero: boolean; scenarios: number } {
  const list = Array.isArray(images)
    ? images.filter((i) => i && typeof (i as { url?: unknown }).url === "string")
    : [];
  return { hero: list.length > 0, scenarios: Math.max(0, list.length - 1) };
}

export function ProjectList({
  docs,
  lastIssue,
}: {
  docs: ProjectDatasheet[];
  lastIssue: Map<string, Issue>;
}) {
  if (docs.length === 0) return null;
  return (
    /* The catalogue table's primitives, not a hand-rolled flex list.
       This page used to set its own sizes — an 11px header over 12px rows —
       so it read as a smaller, lesser table than /dashboard two clicks away,
       and every column width lived in a separate object that had to be kept
       in step with the header by hand. */
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="border-b-2 border-foreground/15 bg-muted hover:bg-muted">
            <TableHead className="w-[72px]">分公司</TableHead>
            <TableHead>文件</TableHead>
            <TableHead className="w-[150px]">客戶</TableHead>
            <TableHead className="w-[72px]">狀態</TableHead>
            <TableHead className="w-[76px]">標案時間</TableHead>
            {/* Two columns rather than one "pictures" count: the architecture
                diagram is one specific picture that either exists or does
                not, and the vignettes are a number that is never wrong at 3
                and never right at 0. */}
            <TableHead className="w-14 text-center">架構圖</TableHead>
            <TableHead className="w-14 text-center">情境圖</TableHead>
            <TableHead className="w-[112px]">最後產生的 PDF</TableHead>
            {/* Split out of the PDF column, where it was a red phrase glued
                after the date and wrapped the cell onto three lines. Whether
                the file in someone's inbox still matches this document is its
                own question, and it has an answer for documents that have
                never been printed too. */}
            <TableHead className="w-[104px]">PDF 現況</TableHead>
            <TableHead className="w-[128px]" />
          </TableRow>
        </TableHeader>

        <TableBody>
          {docs.map((d, index) => {
            const issue = lastIssue.get(d.id);
            const stale = issue ? new Date(d.updated_at) > new Date(issue.issued_at) : false;
            const pics = diagramCounts(d.images);
            return (
              <TableRow
                key={d.id}
                className={`hover:bg-engenius-blue/[0.06] ${index % 2 === 1 ? "bg-muted/30" : ""}`}
              >
                <TableCell>
                  {d.branch && (
                    <span className="inline-block rounded bg-[#eef2f7] px-1.5 py-0.5 text-xs font-medium text-[#1b3a5c]">
                      {d.branch}
                    </span>
                  )}
                </TableCell>

                {/* The flexible column: every other one is fixed, so a long
                    name is what gives. `title` so the full one is still
                    reachable — an ellipsis with nothing behind it is how two
                    deals for the same customer become indistinguishable. */}
                <TableCell className="max-w-0 truncate" title={d.name}>
                  <Link
                    href={`/projects/${d.id}`}
                    className="font-medium text-[#231f20] hover:text-engenius-blue"
                  >
                    {d.name}
                  </Link>
                </TableCell>

                <TableCell
                  className="max-w-0 truncate text-muted-foreground"
                  title={d.customer ?? undefined}
                >
                  {d.customer}
                </TableCell>

                <TableCell className="text-muted-foreground">
                  {STATUS_LABEL[d.status] ?? d.status}
                </TableCell>

                <TableCell className="text-muted-foreground">{d.tender_date}</TableCell>

                <TableCell className="text-center">
                  <span
                    title={pics.hero ? "有架構圖" : "還沒有架構圖"}
                    className={
                      pics.hero
                        ? "inline-block h-2.5 w-2.5 rounded-full bg-emerald-500"
                        : "inline-block h-2.5 w-2.5 rounded-full border-2 border-muted-foreground/25"
                    }
                  />
                </TableCell>

                <TableCell
                  className={`text-center tabular-nums ${
                    pics.scenarios > 0 ? "text-[#231f20]" : "text-muted-foreground/50"
                  }`}
                  title={pics.scenarios > 0 ? `${pics.scenarios} 張情境圖` : "還沒有情境圖"}
                >
                  {pics.scenarios || "—"}
                </TableCell>

                <TableCell className="tabular-nums">
                  {issue ? (
                    <span className="text-[#231f20]">
                      {day(issue.issued_at)}
                      <span className="ml-1 text-muted-foreground">第 {issue.issue_no} 版</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">還沒產生過</span>
                  )}
                </TableCell>

                <TableCell>
                  {!issue ? (
                    <span className="text-muted-foreground/50">—</span>
                  ) : stale ? (
                    <span className="text-[#b45309]">產生後又改過</span>
                  ) : (
                    <span className="text-emerald-700">已是最新</span>
                  )}
                </TableCell>

                <TableCell>
                  <span className="flex items-center justify-end gap-3">
                    <Link
                      href={`/projects/${d.id}`}
                      className="text-engenius-blue hover:underline"
                    >
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
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
