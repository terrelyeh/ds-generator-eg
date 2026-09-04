"use client";

/**
 * Tiny client page that reads the stashed post-login destination from
 * sessionStorage and navigates there. See sign-in-form.tsx for why we
 * stash `next` in sessionStorage instead of OAuth `redirectTo`.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { safeNextPath } from "../safe-next";
import { NEXT_KEY } from "./sign-in-form";

export function RedirectingPage() {
  const router = useRouter();

  useEffect(() => {
    let next = "/";
    try {
      // startsWith("/") is not enough — see safeNextPath.
      next = safeNextPath(sessionStorage.getItem(NEXT_KEY));
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
