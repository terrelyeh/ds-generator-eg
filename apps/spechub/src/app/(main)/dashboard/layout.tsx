import { createAdminClient } from "@eg/db/admin";
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

  // Show all product solutions, including ones with no product lines yet.
  // Empty ones are rendered as disabled placeholders in the sidebar (see
  // SolutionSidebar) so users can see what's coming, but can't click into a
  // dead dashboard tab. They remain usable for knowledge tagging + Ask.
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
