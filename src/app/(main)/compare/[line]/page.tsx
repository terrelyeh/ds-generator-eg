import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { ProductLine } from "@/types/database";

interface ComparisonRow {
  model_name: string;
  category: string;
  label: string;
  value: string;
  sort_order: number;
}

interface CloudComparisonRow {
  model_name: string;
  label: string | null;
  specs: Record<string, string>;
  sort_order: number;
}

export default async function ComparePage({
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

  // Fetch comparisons + cloud comparisons
  const { data: compData } = (await supabase
    .from("comparisons")
    .select("model_name, category, label, value, sort_order")
    .eq("product_line_id", productLine.id)
    .order("sort_order")) as { data: ComparisonRow[] | null };

  const { data: cloudData } = (await supabase
    .from("cloud_comparisons")
    .select("model_name, label, specs, sort_order")
    .eq("product_line_id", productLine.id)
    .order("sort_order")) as { data: CloudComparisonRow[] | null };

  const comparisons = compData ?? [];
  const cloudComparisons = cloudData ?? [];

  // Build comparison table: models as columns, categories > labels as rows
  const models = [...new Set(comparisons.map((c) => c.model_name))];
  const categories: { name: string; rows: { label: string; values: Map<string, string> }[] }[] = [];
  const catMap = new Map<string, Map<string, Map<string, string>>>();

  for (const c of comparisons) {
    if (!catMap.has(c.category)) catMap.set(c.category, new Map());
    const cat = catMap.get(c.category)!;
    if (!cat.has(c.label)) cat.set(c.label, new Map());
    cat.get(c.label)!.set(c.model_name, c.value);
  }

  for (const [catName, labels] of catMap) {
    const rows: { label: string; values: Map<string, string> }[] = [];
    for (const [label, values] of labels) {
      rows.push({ label, values });
    }
    categories.push({ name: catName, rows });
  }

  // Build cloud comparison headers
  const cloudHeaders = cloudComparisons.length > 0
    ? Object.keys(cloudComparisons[0].specs)
    : [];

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          Product Comparison — {productLine.label}
        </h1>
      </div>

      {/* Full Spec Comparison Table */}
      {comparisons.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Spec Comparison
          </h2>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="sticky left-0 bg-muted/50 px-4 py-2.5 text-left font-medium text-muted-foreground min-w-[180px]">
                    Spec
                  </th>
                  {models.map((m) => (
                    <th
                      key={m}
                      className="px-4 py-2.5 text-left font-medium text-foreground min-w-[140px]"
                    >
                      <Link
                        href={`/product/${m}`}
                        className="text-engenius-blue hover:underline"
                      >
                        {m}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <>
                    <tr key={`cat-${cat.name}`} className="bg-engenius-blue/5">
                      <td
                        colSpan={models.length + 1}
                        className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-engenius-blue"
                      >
                        {cat.name}
                      </td>
                    </tr>
                    {cat.rows.map((row) => (
                      <tr key={`${cat.name}-${row.label}`} className="border-b last:border-0">
                        <td className="sticky left-0 bg-card px-4 py-2 font-medium text-muted-foreground">
                          {row.label}
                        </td>
                        {models.map((m) => (
                          <td key={m} className="px-4 py-2 text-foreground">
                            {row.values.get(m) ?? "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Cloud Comparison Table */}
      {cloudComparisons.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Cloud Platform Comparison
          </h2>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="sticky left-0 bg-muted/50 px-4 py-2.5 text-left font-medium text-muted-foreground min-w-[140px]">
                    Model
                  </th>
                  {cloudHeaders.map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left font-medium text-foreground min-w-[120px]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cloudComparisons.map((cc) => (
                  <tr key={cc.model_name} className="border-b last:border-0">
                    <td className="sticky left-0 bg-card px-4 py-2">
                      <Link
                        href={`/product/${cc.model_name}`}
                        className="font-medium text-engenius-blue hover:underline"
                      >
                        {cc.model_name}
                      </Link>
                      {cc.label && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {cc.label}
                        </span>
                      )}
                    </td>
                    {cloudHeaders.map((h) => (
                      <td key={h} className="px-4 py-2 text-foreground">
                        {cc.specs[h] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {comparisons.length === 0 && cloudComparisons.length === 0 && (
        <div className="rounded-lg border bg-card py-16 text-center text-sm text-muted-foreground">
          No comparison data available for this product line.
        </div>
      )}
    </div>
  );
}
