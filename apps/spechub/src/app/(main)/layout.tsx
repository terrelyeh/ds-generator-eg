import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { MainShell } from "@/components/layout/main-shell";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Proxy guarantees we have an auth.user, but the user might not have
  // a profile row (i.e. their Google email isn't in email_whitelist).
  // Catch that case here and redirect to /auth/no-access.
  const user = await getCurrentUser();

  if (!user) {
    // Belt-and-braces: ensure their session is killed so they don't loop.
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/auth/no-access");
  }

  return <MainShell user={user}>{children}</MainShell>;
}
