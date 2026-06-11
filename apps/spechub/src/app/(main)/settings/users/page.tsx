import { adminOnly } from "@/lib/auth/page-guards";
import { UsersManager } from "@/components/settings/users-manager";

export default async function UsersSettingsPage() {
  const user = await adminOnly();
  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <UsersManager currentUserId={user.id} />
    </div>
  );
}
