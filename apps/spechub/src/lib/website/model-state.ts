import type { SupabaseClient } from "@supabase/supabase-js";
import { loadMarks, targetsFromMarks, toMark, type MarkRow } from "./marks";
import { parseVersion, type DocLanguage } from "./parse";
import { LOCALE_LANGUAGE, MARK_LOCALES, type Mark, type MarkLocale, type PendingPush } from "./reminders";
import { SITE_CODES, type SiteCode } from "./sites";

/**
 * What the 官網 tab and the 上架追蹤 tab need from SpecHub's side: each
 * language's latest version with its mark, and each site's push state.
 */

export interface LanguageState {
  language: DocLanguage;
  locale: MarkLocale;
  latest: { version: string; generatedAt: string | null; /** SpecHub made this PDF, so it can be marked. */ markable: boolean };
  mark: (Mark & { markedByName: string | null; regenerated: boolean }) | null;
}

export interface SiteState {
  lastPushAt: string | null;
  pushDetected: boolean;
  checkedAt: string | null;
  pending: PendingPush[];
}

const sameVersion = (a: string, b: string) => String(parseVersion(a)) === String(parseVersion(b));

export async function loadLanguageStates(
  supabase: SupabaseClient,
  product: { id: string; current_versions: Record<string, string> | null },
  markRows?: MarkRow[],
): Promise<LanguageState[]> {
  const [marks, { data: versions }] = await Promise.all([
    markRows ? Promise.resolve(markRows.filter((m) => m.product_id === product.id)) : loadMarks(supabase, [product.id]),
    supabase.from("versions").select("locale, version, generated_at").eq("product_id", product.id) as unknown as Promise<{
      data: { locale: string | null; version: string; generated_at: string }[] | null;
    }>,
  ]);
  const userIds = [...new Set(marks.map((m) => m.marked_by).filter((id): id is string => Boolean(id)))];
  const { data: profiles } = userIds.length
    ? ((await supabase.from("profiles").select("id, name, email").in("id", userIds)) as { data: { id: string; name: string | null; email: string }[] | null })
    : { data: [] };

  const generatedAt = (locale: string, version: string) =>
    (versions ?? [])
      .filter((v) => (v.locale ?? "en") === locale && sameVersion(v.version, version))
      .map((v) => v.generated_at)
      .sort()
      .pop() ?? null;

  return MARK_LOCALES.flatMap((locale): LanguageState[] => {
    const version = product.current_versions?.[locale];
    if (!version) return [];
    const row = marks.find((m) => m.locale === locale) ?? null;
    const latestGeneratedAt = generatedAt(locale, version);
    let mark: LanguageState["mark"] = null;
    if (row) {
      const profile = profiles?.find((p) => p.id === row.marked_by);
      const current = generatedAt(locale, row.version);
      mark = {
        ...toMark(row),
        markedByName: profile ? profile.name || profile.email.split("@")[0] : null,
        regenerated: Boolean(row.generated_at && current && new Date(current).getTime() > new Date(row.generated_at).getTime()),
      };
    }
    return [{ language: LOCALE_LANGUAGE[locale], locale, latest: { version, generatedAt: latestGeneratedAt, markable: latestGeneratedAt !== null }, mark }];
  });
}

export async function loadSiteStates(supabase: SupabaseClient): Promise<Partial<Record<SiteCode, SiteState>>> {
  const { data } = (await supabase.from("website_site_state").select("site, checked_at, last_push_at, push_detected, pending")) as {
    data: { site: string; checked_at: string; last_push_at: string | null; push_detected: boolean; pending: PendingPush[] | null }[] | null;
  };
  return Object.fromEntries(
    (data ?? [])
      .filter((row) => (SITE_CODES as readonly string[]).includes(row.site))
      .map((row) => [row.site, { lastPushAt: row.last_push_at, pushDetected: row.push_detected, checkedAt: row.checked_at, pending: row.pending ?? [] }]),
  );
}

export { targetsFromMarks };
