import type { StatusBadge } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What a workspace row's status pills say, most urgent first. A no-match rate
 * needs a few questions behind it before it means anything — one miss out of
 * two is noise, not a knowledge gap.
 */
export function workspaceStatus(
  s: {
    enabled: boolean;
    everUsed: boolean;
    questions: number;
    noMatch: number;
    errors: number;
    lastAt: string | null;
    /** Spend in the window — non-zero with no questions means it was used before logging began. */
    spend?: number;
  },
  now: Date = new Date(),
): StatusBadge[] {
  if (!s.enabled) return [{ tone: "idle", label: "已停用" }];
  if (!s.everUsed) return [{ tone: "idle", label: "從未使用" }];
  if (s.questions === 0 && (s.spend ?? 0) > 0) return [{ tone: "idle", label: "紀錄開始前有使用" }];
  if (s.questions === 0) {
    const idleDays = s.lastAt ? Math.floor((now.getTime() - Date.parse(s.lastAt)) / DAY_MS) : null;
    return [{ tone: "idle", label: idleDays !== null && idleDays >= 30 ? `${idleDays} 天沒人用` : "這段期間沒有提問" }];
  }
  const out: StatusBadge[] = [];
  if (s.errors > 0) out.push({ tone: "crit", label: `${s.errors} 次錯誤` });
  if (s.questions >= 5 && s.noMatch / s.questions >= 0.2) out.push({ tone: "warn", label: "答不出來偏多" });
  return out.length > 0 ? out : [{ tone: "good", label: "正常" }];
}

/** How people reach a workspace, read off where it's allowed to be embedded. */
export function entryLabel(slug: string, allowedOrigins: string[] | null | undefined): string {
  const origins = allowedOrigins ?? [];
  if (origins.some((o) => o.startsWith("chrome-extension://"))) return "Chrome extension";
  const web = origins.find((o) => /^https?:\/\//.test(o));
  if (web) {
    try {
      return `嵌入 ${new URL(web).host}`;
    } catch {
      /* fall through */
    }
  }
  return `/ask/${slug}`;
}
