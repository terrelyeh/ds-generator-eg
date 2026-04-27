"use client";

/**
 * Avatar + dropdown shown in the navbar's right corner. Avatar comes from
 * Google profile (sourced via the `name`/`avatarUrl` fields on profiles).
 *
 * The dropdown is intentionally minimal for v1: just identity + sign out.
 * Future: add "My profile" link when we expose self-service settings.
 */

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { Role } from "@/lib/auth/permissions";
import { ROLE_LABELS } from "@/lib/auth/permissions";

interface UserMenuProps {
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: Role;
}

function initials(emailOrName: string): string {
  const parts = emailOrName.split(/[@.\s_-]/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function UserMenu({ email, name, avatarUrl, role }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const displayName = name || email.split("@")[0];

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md p-1 text-white/90 hover:bg-white/10 transition-colors"
        aria-label="User menu"
        aria-expanded={open}
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={displayName}
            width={28}
            height={28}
            className="h-7 w-7 rounded-full ring-1 ring-white/40"
            referrerPolicy="no-referrer"
            unoptimized
          />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-xs font-semibold text-white ring-1 ring-white/30">
            {initials(displayName)}
          </span>
        )}
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M3 5l3 3 3-3" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 overflow-hidden rounded-lg bg-white text-engenius-dark shadow-lg ring-1 ring-slate-200">
          <div className="px-4 py-3">
            <div className="truncate text-sm font-semibold">{displayName}</div>
            <div className="truncate text-xs text-engenius-gray">{email}</div>
            <div className="mt-1.5 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-600">
              {ROLE_LABELS[role]}
            </div>
          </div>
          <div className="border-t border-slate-100">
            <a
              href="/auth/sign-out"
              className="block px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
            >
              Sign out
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
