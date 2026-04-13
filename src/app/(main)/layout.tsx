"use client";

import { useState } from "react";
import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";
import { Navbar } from "@/components/layout/navbar";
import { AskPanel } from "@/components/ask/ask-panel";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [askPanelOpen, setAskPanelOpen] = useState(false);

  return (
    <div className="flex min-h-full flex-col">
      <Navbar onAskClick={() => setAskPanelOpen(true)} />
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto max-w-[1400px] px-6 py-4 text-center text-xs text-muted-foreground">
          Product SpecHub
          &nbsp;&middot;&nbsp;
          <Link href="/docs/sync" className="text-engenius-blue hover:underline">
            Sync &amp; Notification Guide
          </Link>
          &nbsp;&middot;&nbsp;
          <a href="/docs/drive-folder-and-naming-rules.html" className="text-engenius-blue hover:underline" target="_blank" rel="noopener noreferrer">
            Drive Folder &amp; Naming Rules
          </a>
        </div>
      </footer>
      <Toaster />
      <AskPanel isOpen={askPanelOpen} onClose={() => setAskPanelOpen(false)} />
    </div>
  );
}
