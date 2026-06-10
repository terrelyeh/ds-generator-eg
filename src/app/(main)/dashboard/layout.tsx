import { createAdminClient } from "@/lib/supabase/admin";
import { SolutionSidebar } from "@/components/layout/solution-sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createAdminClient();

  // Fetch product solutions for the sidebar. Non-product "knowledge areas"
  // (kind='knowledge' — platform features, dept SOPs, onboarding) are excluded
  // here; they're only for tagging knowledge + scoping Ask workspaces.
  const { data: solutions } = await supabase
    .from("solutions")
    .select("id, slug, label, icon, color_primary")
    .eq("kind", "product")
    .order("sort_order");

  const { data: productLines } = await supabase
    .from("product_lines")
    .select("solution_id");

  // Count product lines per solution
  const countMap = new Map<string, number>();
  for (const pl of productLines ?? []) {
    countMap.set(pl.solution_id, (countMap.get(pl.solution_id) ?? 0) + 1);
  }

  const solutionItems = (solutions ?? [])
    .map((s) => ({
      ...s,
      product_line_count: countMap.get(s.id) ?? 0,
    }))
    // Hide product solutions that have no product lines yet (e.g. a
    // datasheet-less "platform" solution) — they'd be dead dashboard tabs, but
    // remain usable for knowledge tagging + Ask retrieval.
    .filter((s) => s.product_line_count > 0);

  return (
    <div className="flex flex-1">
      <SolutionSidebar solutions={solutionItems} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
