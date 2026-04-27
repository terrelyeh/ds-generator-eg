import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { UsersManager } from "@/components/settings/users-manager";

export default async function UsersSettingsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    redirect("/dashboard");
  }
  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <UsersManager currentUserId={user.id} />
    </div>
  );
}
