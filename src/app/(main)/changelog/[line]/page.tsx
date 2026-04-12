import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/changelog/local-time";
import type { ProductLine } from "@/types/database";

interface ChangeDetail {
  field: string;
  from: string | null;
  to: string | null;
  type: "added" | "removed" | "modified";
}

interface ChangeLogRow {
  id: string;
  changes_summary: string;
  changes_detail: ChangeDetail[] | null;
  edited_by: string | null;
  edited_at: string | null;
  notified: boolean;
  created_at: string;
  products: { model_name: string } | null;
}

interface RevisionLogRow {
  id: string;
  revision_date: string | null;
  parsed_date: string | null;
  editor: string | null;
  action: string | null;
  target_page: string | null;
  change_type: string | null;
  description: string;
  mkt_close_date: string | null;
}

function TypeBadge({ type }: { type: string }) {
  if (type === "added")
    return (
      <Badge className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0 font-medium">
        Added
      </Badge>
    );
  if (type === "removed")
    return (
      <Badge className="bg-red-100 text-red-600 text-[10px] px-1.5 py-0 font-medium">
        Removed
      </Badge>
    );
  return (
    <Badge className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0 font-medium">
      Modified
    </Badge>
  );
}

function truncate(str: string | null, max: number) {
  if (!str) return "—";
  return str.length > max ? str.slice(0, max) + "..." : str;
}

export default async function ChangeLogPage({
  params,
}: {
  params: Promise<{ line: string }>;
}) {
  const { line } = await params;
  const decodedLine = decodeURIComponent(line);
  const supabase = await createClient();

  const { data: productLine } = (await supabase
    .from("product_lines")
    .select("*")
    .eq("name", decodedLine)
    .single()) as { data: ProductLine | null };

  if (!productLine) notFound();

  // Fetch change logs + revision logs
  const { data: logs } = (await supabase
    .from("change_logs")
    .select(
      `
      id,
      changes_summary,
      changes_detail,
      edited_by,
      edited_at,
      notified,
      created_at,
      products (model_name)
    `
    )
    .eq("product_line_id", productLine.id)
    .not("changes_summary", "ilike", "%no changes%")
    .order("created_at", { ascending: false })
    .limit(200)) as { data: ChangeLogRow[] | null };

  const { data: revisionLogsData } = (await supabase
    .from("revision_logs")
    .select("*")
    .eq("product_line_id", productLine.id)
    .order("parsed_date", { ascending: false, nullsFirst: false })
    .limit(200)) as { data: RevisionLogRow[] | null };

  const revisionLogs = revisionLogsData ?? [];

  // Group change logs by date
  const grouped = new Map<string, ChangeLogRow[]>();
  for (const log of logs ?? []) {
    const dateKey = log.created_at.slice(0, 10);
    if (!grouped.has(dateKey)) grouped.set(dateKey, []);
    grouped.get(dateKey)!.push(log);
  }

  // Group revision logs by parsed_date
  const revGrouped = new Map<string, RevisionLogRow[]>();
  for (const rev of revisionLogs) {
    const dateKey = rev.parsed_date ?? "unknown";
    if (!revGrouped.has(dateKey)) revGrouped.set(dateKey, []);
    revGrouped.get(dateKey)!.push(rev);
  }

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <div className="mb-6">
        <nav className="flex items-center gap-1.5 text-sm">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Dashboard
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="font-medium text-foreground">Change Log</span>
        </nav>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">
          Change Log{" "}
          <span className="text-muted-foreground font-normal">—</span>{" "}
          <span className="text-engenius-blue">{productLine.label}</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Auto-detected changes from Google Sheets sync
        </p>
      </div>

      {/* Sync Change Logs (Deep Diff) — Table Layout */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Sync Changes
        </h2>
        {grouped.size === 0 ? (
          <div className="rounded-lg border bg-card py-12 text-center text-sm text-muted-foreground">
            No sync changes recorded yet. Changes will appear after the next sync detects differences.
          </div>
        ) : (
          <div className="space-y-8">
            {Array.from(grouped).map(([date, entries]) => (
              <div key={date}>
                <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  <LocalTime iso={`${date}T00:00:00Z`} format="date" />
                </h3>

                {entries.map((entry) => {
                  const details = entry.changes_detail;
                  const isNew = entry.changes_summary === "New product added";

                  return (
                    <div
                      key={entry.id}
                      className="mb-4 rounded-lg border bg-card shadow-sm overflow-hidden"
                    >
                      {/* Entry header */}
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 border-b">
                        {entry.products?.model_name ? (
                          <Link
                            href={`/product/${entry.products.model_name}`}
                            className="text-sm font-semibold text-engenius-blue hover:underline"
                          >
                            {entry.products.model_name}
                          </Link>
                        ) : (
                          <span className="text-sm font-semibold text-foreground">
                            📊 Comparison Table
                          </span>
                        )}
                        <LocalTime
                          iso={entry.created_at}
                          format="time"
                          className="text-xs text-muted-foreground tabular-nums"
                        />
                        {isNew && (
                          <Badge className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0">
                            NEW
                          </Badge>
                        )}
                      </div>

                      {/* Change detail table */}
                      {details && details.length > 0 ? (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-xs text-muted-foreground">
                              <th className="px-4 py-2 text-left font-medium w-[100px]">
                                Type
                              </th>
                              <th className="px-4 py-2 text-left font-medium w-[30%]">
                                Field
                              </th>
                              <th className="px-4 py-2 text-left font-medium">
                                From
                              </th>
                              <th className="px-4 py-2 text-left font-medium">
                                To
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {details.map((d, i) => (
                              <tr
                                key={i}
                                className="border-b last:border-0 hover:bg-engenius-blue/[0.06] transition-colors"
                              >
                                <td className="px-4 py-2">
                                  <TypeBadge type={d.type} />
                                </td>
                                <td className="px-4 py-2 font-medium text-foreground">
                                  {d.field}
                                </td>
                                <td className="px-4 py-2 text-muted-foreground">
                                  {d.type === "added" ? (
                                    <span className="text-xs text-muted-foreground/50">
                                      —
                                    </span>
                                  ) : (
                                    <span className="text-red-600/80">
                                      {truncate(d.from, 80)}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-foreground">
                                  {d.type === "removed" ? (
                                    <span className="text-xs text-muted-foreground/50">
                                      —
                                    </span>
                                  ) : (
                                    <span className="text-green-700">
                                      {truncate(d.to, 80)}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        /* Fallback: plain text for old entries without structured data */
                        <div className="px-4 py-3 space-y-0.5">
                          {entry.changes_summary.split("\n").map((cl, i) => (
                            <p
                              key={i}
                              className={`text-sm ${
                                cl.startsWith("+")
                                  ? "text-green-600"
                                  : cl.startsWith("-")
                                    ? "text-red-500"
                                    : "text-foreground"
                              }`}
                            >
                              {cl}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Revision Log from Google Sheets — Reference Only */}
      <section>
        <h2 className="mb-1 text-lg font-semibold text-foreground">
          Revision Log
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Manually maintained in Google Sheets — for reference only
        </p>
        {revisionLogs.length === 0 ? (
          <div className="rounded-lg border bg-card py-12 text-center text-sm text-muted-foreground">
            No revision logs available for this product line.
          </div>
        ) : (
          <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-foreground/10 bg-muted/50 text-xs text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium w-[110px]">
                    Date
                  </th>
                  <th className="px-4 py-2 text-left font-medium w-[90px]">
                    Editor
                  </th>
                  <th className="px-4 py-2 text-left font-medium w-[100px]">
                    Page
                  </th>
                  <th className="px-4 py-2 text-left font-medium w-[80px]">
                    Action
                  </th>
                  <th className="px-4 py-2 text-left font-medium">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                {revisionLogs.map((rev) => (
                  <tr
                    key={rev.id}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      {rev.parsed_date ? (
                        <LocalTime
                          iso={`${rev.parsed_date}T00:00:00Z`}
                          format="date"
                        />
                      ) : (
                        rev.revision_date ?? "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {rev.editor ?? "—"}
                    </td>
                    <td className="px-4 py-2 font-medium text-foreground">
                      {rev.target_page ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      {rev.action ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0"
                        >
                          {rev.action}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-foreground">
                      {rev.description}
                      {rev.change_type && (
                        <Badge
                          variant="secondary"
                          className="ml-2 text-[10px] px-1.5 py-0"
                        >
                          {rev.change_type}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
