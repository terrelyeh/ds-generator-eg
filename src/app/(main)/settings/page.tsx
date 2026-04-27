import { getCurrentUser } from "@/lib/auth/session";
import { SettingsPage } from "@/components/settings/settings-page";

export default async function Settings() {
  const user = await getCurrentUser();
  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <SettingsPage role={user?.role ?? "viewer"} />
    </div>
  );
}
