"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parsePeriod } from "@/lib/analytics/period";
import type { PeriodDays } from "@/lib/analytics/types";

/**
 * Fetch one analytics payload. While a new period loads, the previous data
 * stays on screen (dimmed by the caller) — no skeleton flash, no layout jump.
 */
export function useAnalytics<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);

  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    try {
      const res = await fetch(url, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (id !== latest.current) return;
      if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      setData(body as T);
      setError(null);
    } catch (e) {
      if (id === latest.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, reload: load };
}

/** The period lives in the URL (?days=), so a link to a view keeps its window. */
export function usePeriod(): [PeriodDays, (d: PeriodDays) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const days = parsePeriod(params.get("days"));
  const setDays = useCallback(
    (d: PeriodDays) => {
      const next = new URLSearchParams(params.toString());
      next.set("days", String(d));
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );
  return [days, setDays];
}
