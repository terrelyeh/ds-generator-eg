import { adminOnly } from "@eg/auth/page-guards";
import { ApiAccessManager } from "@/components/settings/api-access-manager";

export default async function ApiAccessPage() {
  await adminOnly();
  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <ApiAccessManager />
    </div>
  );
}
