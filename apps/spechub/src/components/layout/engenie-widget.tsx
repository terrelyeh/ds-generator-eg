"use client";

/**
 * Loads the EnGenie floating Ask widget (Intercom-style bottom-right button)
 * from the EnGenie deployment. Replaces the old in-app AskPanel after the
 * monorepo split — the Ask product (and its /api/ask backend) lives in
 * apps/engenie now.
 *
 * The widget script self-guards against double-mount via
 * window.__engenieWidget[slug], so a remount of this component is a no-op.
 * Requires the internal `spechub` workspace (no passcode; page itself is
 * already behind SpecHub RBAC).
 */

import { useEffect } from "react";

const WORKSPACE = "spechub";

export function EngenieWidget() {
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_ENGENIE_URL;
    if (!base) return;
    const src = `${base.replace(/\/$/, "")}/widget.js`;
    if (document.querySelector(`script[src="${src}"]`)) return;
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.workspace = WORKSPACE;
    s.dataset.title = "Ask EnGenie";
    document.body.appendChild(s);
    // No cleanup: the widget keeps its mount guard; removing the script tag
    // wouldn't unmount the iframe anyway, and the shell lives for the session.
  }, []);

  return null;
}
