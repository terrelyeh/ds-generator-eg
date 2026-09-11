import { taipeiDayKey } from "./period";

export const fmtInt = (n: number): string => n.toLocaleString("en-US");

export function fmtUsd(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return "<$0.01";
  return n < 100 ? `$${n.toFixed(2)}` : `$${Math.round(n).toLocaleString("en-US")}`;
}

/** Whole percent, or null when there is nothing to divide by. */
export const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);

/** "9/11" in Taiwan time. */
export function shortDate(iso: string): string {
  const k = taipeiDayKey(new Date(iso));
  return `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))}`;
}

export function relativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "—";
  const s = Math.max(0, (now.getTime() - Date.parse(iso)) / 1000);
  if (s < 60) return "剛剛";
  if (s < 3600) return `${Math.floor(s / 60)} 分鐘前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小時前`;
  const d = Math.floor(s / 86400);
  return d < 30 ? `${d} 天前` : shortDate(iso);
}

export function change(current: number, previous: number): { pct: number | null; dir: "up" | "down" | "flat" } {
  if (previous === 0) return { pct: null, dir: current > 0 ? "up" : "flat" };
  const p = Math.round(((current - previous) / previous) * 100);
  return { pct: Math.abs(p), dir: p > 0 ? "up" : p < 0 ? "down" : "flat" };
}

export function fmtMs(ms: number | null): string {
  if (ms === null) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} 秒`;
}

export function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export const visitorLabel = (id: string | null): string => (id ? `訪客 ${id.slice(0, 4)}` : "訪客");
