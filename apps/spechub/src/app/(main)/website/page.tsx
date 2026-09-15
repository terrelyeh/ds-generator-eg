import { requirePagePermission } from "@eg/auth/page-guards";
import { WebsiteQuery } from "@/components/website/website-query";

export const dynamic = "force-dynamic";

export default async function WebsitePage() {
  await requirePagePermission("website_check.view");
  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <WebsiteQuery />
    </div>
  );
}
