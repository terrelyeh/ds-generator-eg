"use client";

import Link from "next/link";
import Image from "next/image";
import type { Role } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/permissions";
import { UserMenu } from "./user-menu";

interface NavbarProps {
  onAskClick?: () => void;
  user: {
    email: string;
    name: string | null;
    avatarUrl: string | null;
    role: Role;
  } | null;
}

export function Navbar({ onAskClick, user }: NavbarProps) {
  const role = user?.role;
  const showAsk = can(role, "ask.use");
  const showKnowledge = can(role, "knowledge.view");
  const showSettings = can(role, "settings.view");

  return (
    <header className="sticky top-0 z-50 bg-engenius-blue text-white shadow-md">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <Image
            src="/logo/EnGenius-Logo-white.png"
            alt="EnGenius"
            width={120}
            height={28}
            className="h-7 w-auto"
          />
        </Link>
        <span className="font-heading text-xl font-extrabold tracking-tight">
          Product SpecHub
        </span>
        <div className="ml-auto flex items-center gap-1">
          {showAsk && (
            <button
              type="button"
              onClick={onAskClick}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                  clipRule="evenodd"
                />
              </svg>
              Ask
            </button>
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
  );
}
