import { requirePagePermission } from "@eg/auth/page-guards";
import { WorkspaceAnalytics } from "@/components/analytics/workspace-analytics";

export default async function WorkspaceAnalyticsPage() {
  await requirePagePermission("analytics.view");
  return (
    <div className="mx-auto max-w-[1265px] px-6 py-8">
      <WorkspaceAnalytics />
    </div>
  );
}
