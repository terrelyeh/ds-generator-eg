import { adminOnly } from "@/lib/auth/page-guards";
import { AskWorkspacesManager } from "@/components/settings/ask-workspaces-manager";

export default async function AskWorkspacesPage() {
  await adminOnly();
  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <AskWorkspacesManager />
    </div>
  );
}
