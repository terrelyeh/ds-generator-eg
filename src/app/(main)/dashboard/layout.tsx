import { createAdminClient } from "@/lib/supabase/admin";
import { SolutionSidebar } from "@/components/layout/solution-sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createAdminClient();

  // Fetch solutions with product line counts
  const { data: solutions } = await supabase
    .from("solutions")
    .select("id, slug, label, icon, color_primary")
    .order("sort_order");

  const { data: productLines } = await supabase
    .from("product_lines")
    .select("solution_id");

  // Count product lines per solution
  const countMap = new Map<string, number>();
  for (const pl of productLines ?? []) {
    countMap.set(pl.solution_id, (countMap.get(pl.solution_id) ?? 0) + 1);
  }

  const solutionItems = (solutions ?? []).map((s) => ({
    ...s,
    product_line_count: countMap.get(s.id) ?? 0,
  }));

  return (
    <div className="flex flex-1">
      <SolutionSidebar solutions={solutionItems} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
