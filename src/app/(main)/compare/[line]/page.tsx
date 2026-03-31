import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CompareTable } from "@/components/compare/compare-table";
import type { ProductLine } from "@/types/database";

interface ComparisonRow {
  model_name: string;
  category: string;
  label: string;
  value: string;
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

  const { data: compData } = (await supabase
    .from("comparisons")
    .select("model_name, category, label, value, sort_order")
    .eq("product_line_id", productLine.id)
    .order("sort_order")) as { data: ComparisonRow[] | null };

  const comparisons = compData ?? [];

  // Build structured data: models + categories with rows
  const models = [...new Set(comparisons.map((c) => c.model_name))];

  const catMap = new Map<
    string,
    Map<string, Map<string, string>>
  >();
  for (const c of comparisons) {
    if (!catMap.has(c.category)) catMap.set(c.category, new Map());
    const cat = catMap.get(c.category)!;
    if (!cat.has(c.label)) cat.set(c.label, new Map());
    cat.get(c.label)!.set(c.model_name, c.value);
  }

  const categories: {
    name: string;
    rows: { label: string; values: Record<string, string> }[];
  }[] = [];

  for (const [catName, labels] of catMap) {
    const rows: { label: string; values: Record<string, string> }[] = [];
    for (const [label, valuesMap] of labels) {
      const values: Record<string, string> = {};
      for (const [k, v] of valuesMap) values[k] = v;
      rows.push({ label, values });
    }
    categories.push({ name: catName, rows });
  }

  return (
    <div className="mx-auto max-w-[96vw] px-4 py-8">
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          Spec Comparison — {productLine.label}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {models.length} models &middot; {comparisons.length} spec entries
        </p>
      </div>

      {comparisons.length > 0 ? (
        <CompareTable models={models} categories={categories} />
      ) : (
        <div className="rounded-lg border bg-card py-16 text-center text-sm text-muted-foreground">
          No comparison data available for this product line.
        </div>
      )}
    </div>
  );
}
