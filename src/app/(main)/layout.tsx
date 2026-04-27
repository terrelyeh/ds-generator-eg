import { getCurrentUser } from "@/lib/auth/session";
import { MainShell } from "@/components/layout/main-shell";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware guarantees we have a user here, but we still tolerate null
  // (e.g. preview deploys with auth disabled, future public landing pages).
  const user = await getCurrentUser();

  return <MainShell user={user}>{children}</MainShell>;
}
