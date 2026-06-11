"use client";

/**
 * Navbar + Footer chrome around `(main)/*` pages. The user object is
 * fetched server-side in (main)/layout.tsx and passed down so the navbar
 * can show the right items without a client-side /api/me call.
 *
 * Unlike SpecHub there is no slide-in Ask panel here — the full-page
 * /ask experience IS the product on this app.
 */

import Link from "next/link";
import Image from "next/image";
import { Toaster } from "@/components/ui/sonner";
import { can, type Role } from "@eg/auth/permissions";
import { UserMenu } from "./user-menu";

interface EngenieShellProps {
  children: React.ReactNode;
  user: {
    email: string;
    name: string | null;
    avatarUrl: string | null;
    role: Role;
  } | null;
}

export function EngenieShell({ children, user }: EngenieShellProps) {
  const role = user?.role;
  const showAsk = can(role, "ask.use");
  const showKnowledge = can(role, "knowledge.view");
  const showSettings = can(role, "settings.view");

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-50 bg-engenius-blue text-white shadow-md">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-6">
          <Link href="/ask" className="flex items-center gap-3">
            <Image
              src="/logo/EnGenius-Logo-white.png"
              alt="EnGenius"
              width={120}
              height={28}
              className="h-7 w-auto"
            />
          </Link>
          <span className="font-heading text-xl font-extrabold tracking-tight">
            EnGenie
          </span>
          <div className="ml-auto flex items-center gap-1">
            {showAsk && (
              <Link
                href="/ask"
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M18 10c0 3.866-3.582 7-8 7a8.84 8.84 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7z"
                    clipRule="evenodd"
                  />
                </svg>
                Ask
              </Link>
            )}
            {showKnowledge && (
              <Link
                href="/knowledge"
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                </svg>
                Knowledge
              </Link>
            )}
            {showSettings && (
              <Link
                href="/settings"
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                    clipRule="evenodd"
                  />
                </svg>
                Settings
              </Link>
            )}
            {user && (
              <div className="ml-2">
                <UserMenu
                  email={user.email}
                  name={user.name}
                  avatarUrl={user.avatarUrl}
                  role={user.role}
                />
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto max-w-[1400px] px-6 py-4 text-center text-xs text-muted-foreground">
          EnGenie — EnGenius Knowledge Platform
        </div>
      </footer>
      <Toaster />
    </div>
  );
}
