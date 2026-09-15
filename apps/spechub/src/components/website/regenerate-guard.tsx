"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SiteVerdict } from "@/lib/website/compare";
import type { LanguageState } from "@/lib/website/model-state";
import { parseVersion, type DocLanguage } from "@/lib/website/parse";
import { languageVerdict, LOCALE_LANGUAGE, sitesByLanguage, stageOf, type MarkLocale, type Stage } from "@/lib/website/reminders";
import type { SiteCode } from "@/lib/website/sites";
import { LANGUAGE_NAME, SiteLabel } from "./badges";

/**
 * Asks before a Regenerate overwrites a version marked 可上架.
 *
 * Regenerate keeps the version number, so a site that already has v1.3 would
 * then hold the old file under the same number — nothing a customer can tell
 * apart. The dialog shows which sites that affects and offers a new version
 * instead. Regenerating keeps the mark: it is usually a fix, and the daily
 * check spots the old files by size and reminds marketing to replace them.
 *
 * Versions without a 可上架 mark regenerate straight away, as before.
 */

export type RegenerateChoice = "regenerate" | "new" | "cancel";

interface Pending {
  language: DocLanguage;
  version: string;
  sites: { site: SiteCode; stage: Stage }[];
  resolve: (choice: RegenerateChoice) => void;
}

const SITUATION: Record<Stage, { now: string; after: string; warn: boolean }> = {
  live: { now: "已上線", after: "重產後站上變成舊檔，要重新上傳", warn: true },
  push: { now: "測試站已上傳，等推送", after: "推送前要先換成新檔", warn: true },
  fix: { now: "站上的檔案本來就要處理", after: "一樣要上傳新檔", warn: true },
  upload: { now: "還沒上架", after: "上架時直接用新檔", warn: false },
  nopage: { now: "沒有產品頁", after: "不受影響", warn: false },
  unknown: { now: "還沒查過", after: "每日檢查會再確認", warn: false },
};

export function useRegenerateGuard() {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirmRegenerate = useCallback(async (model: string, locale: string, version: string): Promise<RegenerateChoice> => {
    if (!(locale in LOCALE_LANGUAGE)) return "regenerate";
    let body: { languages?: LanguageState[]; sites?: { site: SiteCode; verdict: SiteVerdict }[] } | null = null;
    try {
      // No permission, or the check can't be read: don't stand between someone and a PDF.
      const res = await fetch(`/api/website/check?model=${encodeURIComponent(model)}`, { cache: "no-store" });
      if (res.ok) body = await res.json();
    } catch {
      body = null;
    }
    const mark = body?.languages?.find((l) => l.locale === locale)?.mark;
    if (!mark || mark.decision !== "ready" || String(parseVersion(mark.version)) !== String(parseVersion(version))) return "regenerate";

    const language = LOCALE_LANGUAGE[locale as MarkLocale];
    const { groups } = sitesByLanguage(new Set((body?.languages ?? []).map((l) => l.language)));
    const sites = (groups.find((g) => g.language === language)?.sites ?? []).map((site) => ({
      site,
      stage: stageOf(languageVerdict(body?.sites?.find((s) => s.site === site)?.verdict, language)?.status),
    }));
    return new Promise<RegenerateChoice>((resolve) => setPending({ language, version, sites, resolve }));
  }, []);

  const close = (choice: RegenerateChoice) => {
    pending?.resolve(choice);
    setPending(null);
  };

  const dialog = (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) close("cancel");
      }}
    >
      <DialogContent className="gap-3 sm:max-w-lg" showCloseButton={false}>
        {pending && (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-900">
                {LANGUAGE_NAME[pending.language]} v{pending.version} 已標記可上架
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-700">重產會用同一個版號覆蓋這份 PDF。這一版在各站的狀況：</DialogDescription>
            </DialogHeader>
            <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-300">
              {pending.sites.map(({ site, stage }) => (
                <li key={site} className="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-x-3 px-3 py-2">
                  <SiteLabel site={site} className="text-[15px] leading-6" />
                  <span className="flex flex-col">
                    <span className="text-sm text-slate-800">{SITUATION[stage].now}</span>
                    <span className={`text-xs font-semibold ${SITUATION[stage].warn ? "text-amber-700" : "text-slate-500"}`}>{SITUATION[stage].after}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-slate-700">標記會保留，下一次每日檢查會把要換檔的站列進行銷的提醒。</p>
            <p className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <b className="font-semibold text-slate-900">內容有改嗎？</b>例如規格數字或功能描述，建議改出新版本，各區行銷和客戶看版號就分得出新舊。
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => close("cancel")}>
                取消
              </Button>
              <Button variant="outline" onClick={() => close("new")}>
                改出新版本
              </Button>
              <Button onClick={() => close("regenerate")}>重產 v{pending.version}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );

  return { confirmRegenerate, dialog };
}
