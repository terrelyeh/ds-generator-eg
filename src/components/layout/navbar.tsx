"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

export function Navbar() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync?force=true", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        const totalSynced = data.results.reduce(
          (sum: number, r: { synced: string[] }) => sum + r.synced.length,
          0
        );
        alert(
          totalSynced > 0
            ? `${totalSynced} products synced across all lines.`
            : "All data is up to date."
        );
        router.refresh();
      } else {
        alert(`Sync failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      alert(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <header className="bg-engenius-blue text-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image
            src="/logo/EnGenius-Logo-white.png"
            alt="EnGenius"
            width={120}
            height={28}
            className="h-7 w-auto"
          />
        </Link>
        <span className="text-lg font-semibold tracking-tight">
          Product <span className="opacity-80">SpecHub</span>
        </span>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-white/30 px-2.5 py-1 text-xs font-medium text-white/90 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M1 8a7 7 0 0 1 13.1-3.5M15 8a7 7 0 0 1-13.1 3.5" />
            <path d="M14 1v4h-4M2 15v-4h4" />
          </svg>
          {syncing ? "Syncing…" : "Sync"}
        </button>
      </div>
    </header>
  );
}
