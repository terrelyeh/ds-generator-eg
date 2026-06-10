"use client";

import { useEffect, useRef, useState } from "react";
import { EngenieShell } from "./engenie-shell";
import { EngenieMark } from "./engenie-mark";
import { getWsToken, setWsToken } from "@/lib/demo/ws-token";

/**
 * Embedded-widget entry for /embed/<slug>. Token-based auth (no cookies, since
 * the widget runs in a cross-site iframe): the workspace passcode is exchanged
 * once for an HMAC token kept in localStorage and sent as a bearer header.
 * Workspaces with no passcode auto-authenticate for a frictionless widget.
 */
export function EngenieEmbed({
  slug,
  title,
  hasPasscode,
}: {
  slug: string;
  title: string;
  hasPasscode: boolean;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "need-pass" | "ready">("loading");
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const existing = getWsToken(slug);
    if (existing) {
      setToken(existing);
      setStatus("ready");
      return;
    }
    if (hasPasscode) {
      setStatus("need-pass");
      return;
    }
    // No passcode → exchange an empty key for a token (open widget).
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/ws-auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, key: "" }),
        });
        const d = await r.json();
        if (cancelled) return;
        if (r.ok && d.token) {
          setWsToken(slug, d.token);
          setToken(d.token);
          setStatus("ready");
        } else {
          setStatus("need-pass");
        }
      } catch {
        if (!cancelled) setStatus("need-pass");
      }
    })();
    return () => { cancelled = true; };
  }, [slug, hasPasscode]);

  useEffect(() => {
    if (status === "need-pass") setTimeout(() => inputRef.current?.focus(), 50);
  }, [status]);

  async function submitPasscode(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || submitting) return;
    setSubmitting(true);
    setError(false);
    try {
      const r = await fetch("/api/ws-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, key: value.trim() }),
      });
      const d = await r.json();
      if (r.ok && d.token) {
        setWsToken(slug, d.token);
        setToken(d.token);
        setStatus("ready");
      } else {
        setError(true);
        setValue("");
      }
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "ready" && token) {
    return <EngenieShell workspace={slug} title={title} authToken={`${slug}.${token}`} />;
  }

  if (status === "need-pass") {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#faf9f5] px-6">
        <div className="flex w-full max-w-[300px] flex-col items-center">
          <EngenieMark size={48} />
          <h1 className="mt-4 font-heading text-[20px] font-bold tracking-tight text-engenius-dark">{title}</h1>
          <p className="mt-1 text-[12px] text-engenius-gray">Enter the access code to start</p>
          <form onSubmit={submitPasscode} className="mt-6 flex w-full flex-col gap-2.5">
            <input
              ref={inputRef}
              type="password"
              inputMode="text"
              autoComplete="off"
              placeholder="Access code"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={submitting}
              className={`h-11 w-full rounded-full border bg-white px-4 text-[14px] text-engenius-dark outline-none transition-all placeholder:text-engenius-dark/35 focus:border-engenius-blue focus:ring-2 focus:ring-engenius-blue/20 ${
                error ? "animate-[shake_0.4s_ease-in-out] border-red-400" : "border-border"
              }`}
            />
            <button
              type="submit"
              disabled={submitting || !value.trim()}
              className="h-11 w-full rounded-full bg-engenius-dark text-[14px] font-medium text-white transition-all hover:bg-engenius-dark/90 disabled:opacity-40"
            >
              {submitting ? "Checking..." : "Enter"}
            </button>
          </form>
        </div>
        <style jsx>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-6px); }
            75% { transform: translateX(6px); }
          }
        `}</style>
      </div>
    );
  }

  // loading
  return <div className="min-h-[100dvh] bg-[#faf9f5]" />;
}
