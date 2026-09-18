import type { DocLanguage } from "@/lib/website/parse";
import { monthDay } from "@/lib/website/reminders";
import type { SiteCode } from "@/lib/website/sites";

/**
 * The two things the 官網 screens mix — a SpecHub language version and a
 * regional site — always drawn in different shapes: a language is a dark
 * glyph tile (A / あ / 繁), a site has a globe in front. Color is left for
 * status. No flags: Windows can't draw flag emoji and shows "JP" / "TW"
 * letters, which read exactly like the site codes.
 */

export function GlobeIcon({ className = "h-[15px] w-[15px] text-slate-500" }: { className?: string }) {
  return (
    <svg className={`shrink-0 ${className}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M2.8 10h14.4M10 2.8c2 2 3 4.4 3 7.2s-1 5.2-3 7.2c-2-2-3-4.4-3-7.2s1-5.2 3-7.2z" />
    </svg>
  );
}

export function SiteLabel({ site, className = "text-[15px]" }: { site: SiteCode | string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap font-bold tracking-wide text-slate-900 ${className}`}>
      <GlobeIcon />
      {site}
    </span>
  );
}

export const LANGUAGE_GLYPH: Record<DocLanguage, string> = { en: "A", ja: "あ", zh: "繁" };
export const LANGUAGE_NAME: Record<DocLanguage, string> = { en: "English", ja: "日本語", zh: "繁體中文" };

export function LanguageBadge({ language, size = "md" }: { language: DocLanguage; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-[22px] w-[22px] rounded-[5px] text-[11.5px]" : "h-[30px] w-[30px] rounded-[7px] text-sm";
  return (
    <span aria-hidden className={`inline-grid shrink-0 place-items-center bg-slate-700 font-bold leading-none text-white ${box}`}>
      {LANGUAGE_GLYPH[language]}
    </span>
  );
}

export function TagIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={`shrink-0 ${className}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M2 8.6V3a1 1 0 0 1 1-1h5.6l5.4 5.4a1 1 0 0 1 0 1.4l-4.6 4.6a1 1 0 0 1-1.4 0z" />
      <circle cx="5.2" cy="5.2" r="1" />
    </svg>
  );
}

/** "上次推送約 9/15" once a push has been seen, "上次推送 9/11 之後" while it is only a lower bound. */
export function pushText(state: { lastPushAt: string | null; pushDetected: boolean } | undefined): string | null {
  if (!state?.lastPushAt) return null;
  return state.pushDetected ? `上次推送約 ${monthDay(state.lastPushAt)}` : `上次推送 ${monthDay(state.lastPushAt)} 之後`;
}
