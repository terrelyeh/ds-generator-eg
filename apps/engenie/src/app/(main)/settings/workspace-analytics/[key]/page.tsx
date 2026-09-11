import { requirePagePermission } from "@eg/auth/page-guards";
import { WorkspaceAnalyticsDetail } from "@/components/analytics/workspace-analytics-detail";

export default async function WorkspaceAnalyticsDetailPage({ params }: { params: Promise<{ key: string }> }) {
  await requirePagePermission("analytics.view");
  const { key } = await params;
  return (
    <div className="mx-auto max-w-[1265px] px-6 py-8">
      <WorkspaceAnalyticsDetail workspaceKey={key} />
    </div>
  );
}
