import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
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

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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

  // Fetch change logs for this product line, excluding "no changes"
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

  // Group by date
  const grouped = new Map<string, ChangeLogRow[]>();
  for (const log of logs ?? []) {
    const dateKey = new Date(log.created_at).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    if (!grouped.has(dateKey)) grouped.set(dateKey, []);
    grouped.get(dateKey)!.push(log);
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
          History of synced changes for {productLine.label} products
        </p>
      </div>

      {grouped.size === 0 ? (
        <div className="rounded-lg border bg-card py-16 text-center text-sm text-muted-foreground">
          No changes recorded yet.
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(grouped).map(([date, entries]) => (
            <div key={date}>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {date}
              </h2>
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
                      <div className="flex items-baseline gap-2">
                        <Link
                          href={`/product/${entry.products?.model_name ?? ""}`}
                          className="text-sm font-medium text-engenius-blue hover:underline"
                        >
                          {entry.products?.model_name ?? "Unknown"}
                        </Link>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatDateTime(entry.created_at)}
                        </span>
                        {entry.changes_summary.startsWith("New product") && (
                          <Badge className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0">
                            NEW
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-foreground">
                        {entry.changes_summary}
                      </p>
                      {entry.edited_by && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
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
    </div>
  );
}
