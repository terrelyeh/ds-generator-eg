"use client";

/**
 * Tiny client page that reads the stashed post-login destination from
 * sessionStorage and navigates there. See sign-in-form.tsx for why we
 * stash `next` in sessionStorage instead of OAuth `redirectTo`.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const NEXT_KEY = "specHub.auth.next";

export default function RedirectingPage() {
  const router = useRouter();

  useEffect(() => {
    let next = "/";
    try {
      const stored = sessionStorage.getItem(NEXT_KEY);
      if (stored && stored.startsWith("/")) {
        next = stored;
      }
    } catch {
      /* ignore */
    } finally {
      try {
        sessionStorage.removeItem(NEXT_KEY);
      } catch {
        /* ignore */
      }
    }
    router.replace(next);
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="text-sm text-engenius-gray">Signing you in…</div>
    </div>
  );
}
