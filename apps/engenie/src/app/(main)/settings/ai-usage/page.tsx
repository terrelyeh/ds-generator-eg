import { requirePagePermission } from "@eg/auth/page-guards";
import { AiUsageDashboard } from "@/components/settings/ai-usage-dashboard";

export default async function AiUsagePage() {
  await requirePagePermission("billing.view");
  return (
    <div className="mx-auto max-w-[1265px] px-6 py-8">
      <AiUsageDashboard />
    </div>
  );
}
