"use client";

/**
 * Client wrapper that holds Ask-panel open/close state and renders the
 * Navbar + Footer + AskPanel chrome around `(main)/*` pages. The user
 * object is fetched server-side in (main)/layout.tsx and passed down so
 * the navbar can show the right items without needing a client-side
 * /api/me call (which would flash the wrong UI).
 */

import { useState } from "react";
import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";
import { Navbar } from "@/components/layout/navbar";
import { AskPanel } from "@/components/ask/ask-panel";
import { can, type Role } from "@/lib/auth/permissions";

interface MainShellProps {
  children: React.ReactNode;
  user: {
    email: string;
    name: string | null;
    avatarUrl: string | null;
    role: Role;
  } | null;
}

export function MainShell({ children, user }: MainShellProps) {
  const [askPanelOpen, setAskPanelOpen] = useState(false);
  const showAsk = can(user?.role, "ask.use");

  return (
    <div className="flex min-h-full flex-col">
      <Navbar
        user={user}
        onAskClick={showAsk ? () => setAskPanelOpen(true) : undefined}
      />
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto max-w-[1400px] px-6 py-4 text-center text-xs text-muted-foreground">
          Product SpecHub
          &nbsp;&middot;&nbsp;
          <Link href="/docs/sync" className="text-engenius-blue hover:underline">
            Sync &amp; Notification Guide
          </Link>
          &nbsp;&middot;&nbsp;
          <a
            href="/docs/drive-folder-and-naming-rules.html"
            className="text-engenius-blue hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Drive Folder &amp; Naming Rules
          </a>
        </div>
      </footer>
      <Toaster />
      {showAsk && (
        <AskPanel isOpen={askPanelOpen} onClose={() => setAskPanelOpen(false)} />
      )}
    </div>
  );
}
