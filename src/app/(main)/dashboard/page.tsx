import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function DashboardIndex() {
  const supabase = createAdminClient();

  // Redirect to the first solution
  const { data: solutions } = await supabase
    .from("solutions")
    .select("slug")
    .order("sort_order")
    .limit(1);

  const slug = solutions?.[0]?.slug ?? "cloud";
  redirect(`/dashboard/${slug}`);
}
