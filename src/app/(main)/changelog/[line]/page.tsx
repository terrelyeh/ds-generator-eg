import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/changelog/local-time";
import type { ProductLine } from "@/types/database";

interface ChangeLogRow {
  id: string;
  changes_summary: string;
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

export default async function ChangeLogPage({
  params,
}: {
  params: Promise<{ line: string }>;
}) {
  const { line } = await params;
  const decodedLine = decodeURIComponent(line);
  const supabase = await createClient();

  // Find the product line
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
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          Change Log — {productLine.label}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          History of synced changes and revision logs for {productLine.label}
        </p>
      </div>

      {/* Sync Change Logs (Deep Diff) */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Sync Changes
        </h2>
        {grouped.size === 0 ? (
          <div className="rounded-lg border bg-card py-12 text-center text-sm text-muted-foreground">
            No sync changes recorded yet.
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(grouped).map(([date, entries]) => (
              <div key={date}>
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  <LocalTime iso={`${date}T00:00:00Z`} format="date" />
                </h3>
                <div className="rounded-lg border bg-card divide-y">
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 px-4 py-3"
                    >
                      <div
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          entry.notified ? "bg-green-400" : "bg-amber-400"
                        }`}
                        title={
                          entry.notified ? "Notified" : "Pending notification"
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <Link
                            href={`/product/${entry.products?.model_name ?? ""}`}
                            className="text-sm font-medium text-engenius-blue hover:underline"
                          >
                            {entry.products?.model_name ?? "Unknown"}
                          </Link>
                          <LocalTime
                            iso={entry.created_at}
                            format="time"
                            className="text-xs text-muted-foreground tabular-nums"
                          />
                          {entry.changes_summary.startsWith("New product") && (
                            <Badge className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0">
                              NEW
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 space-y-0.5">
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
                        {entry.edited_by && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            by {entry.edited_by}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Revision Log from Google Sheets */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Revision Log
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            (from Google Sheets)
          </span>
        </h2>
        {revisionLogs.length === 0 ? (
          <div className="rounded-lg border bg-card py-12 text-center text-sm text-muted-foreground">
            No revision logs available.
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(revGrouped).map(([date, entries]) => (
              <div key={date}>
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  {date === "unknown" ? (
                    "Unknown Date"
                  ) : (
                    <LocalTime iso={`${date}T00:00:00Z`} format="date" />
                  )}
                </h3>
                <div className="rounded-lg border bg-card divide-y">
                  {entries.map((rev) => (
                    <div
                      key={rev.id}
                      className="flex items-start gap-3 px-4 py-3"
                    >
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-400" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          {rev.target_page && (
                            <span className="text-sm font-medium text-foreground">
                              {rev.target_page}
                            </span>
                          )}
                          {rev.action && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {rev.action}
                            </Badge>
                          )}
                          {rev.change_type && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {rev.change_type}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-foreground">
                          {rev.description}
                        </p>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          {rev.editor && <span>by {rev.editor}</span>}
                          {rev.mkt_close_date && (
                            <span>MKT Close: {rev.mkt_close_date}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
