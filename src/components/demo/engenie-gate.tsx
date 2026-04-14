"use client";

import { useEffect, useRef, useState } from "react";
import { EngenieMark } from "./engenie-mark";

const STORAGE_KEY = "engenie_auth";

export function EngenieGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setAuthed(window.sessionStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  useEffect(() => {
    if (authed === false) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [authed]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || loading) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/demo-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: value.trim() }),
      });
      if (res.ok) {
        window.sessionStorage.setItem(STORAGE_KEY, "1");
        setAuthed(true);
        return;
      }
      triggerError();
    } catch {
      triggerError();
    } finally {
      setLoading(false);
    }
  }

  function triggerError() {
    setError(true);
    setValue("");
    setTimeout(() => setError(false), 600);
  }

  if (authed === null) {
    return <div className="min-h-[100dvh] bg-background" />;
  }

  if (authed) return <>{children}</>;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-[320px] flex-col items-center">
        <EngenieMark size={56} />
        <h1 className="mt-5 font-heading text-[28px] font-bold tracking-tight text-engenius-dark">
          EnGenie
        </h1>
        <p className="mt-1 text-[13px] text-engenius-gray">
          Your EnGenius Product Genius
        </p>

        <form onSubmit={handleSubmit} className="mt-10 flex w-full flex-col gap-3">
          <input
            ref={inputRef}
            type="password"
            inputMode="text"
            autoComplete="off"
            placeholder="Access code"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={loading}
            className={`h-12 w-full rounded-full border bg-white px-5 text-[15px] outline-none transition-all placeholder:text-engenius-gray/60 focus:border-engenius-blue focus:ring-2 focus:ring-engenius-blue/20 ${
              error ? "animate-[shake_0.4s_ease-in-out] border-red-400" : "border-border"
            }`}
          />
          <button
            type="submit"
            disabled={loading || !value.trim()}
            className="h-12 w-full rounded-full bg-engenius-dark text-[15px] font-medium text-white transition-all hover:bg-engenius-dark/90 disabled:opacity-40"
          >
            {loading ? "Checking..." : "Enter"}
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
