"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Search, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtInt, fmtMs, relativeTime, shortDate } from "@/lib/analytics/format";
import { LOW_SIMILARITY, type CountSummary, type PeriodDays, type QuestionFilter, type QuestionItem, type QuestionPage } from "@/lib/analytics/types";
import { EmptyState } from "./panel";

const FILTERS: { key: QuestionFilter; label: string; count: (s: CountSummary) => number; empty: string }[] = [
  { key: "all", label: "全部", count: (s) => s.questions, empty: "這段期間沒有提問" },
  { key: "no_match", label: "答不出來", count: (s) => s.noMatch, empty: "這段期間每一題都找得到資料" },
  { key: "low_similarity", label: "相似度低", count: (s) => s.lowSimilarity, empty: "沒有只靠勉強相關的資料回答的問題" },
  { key: "unhelpful", label: "沒幫助", count: (s) => s.unhelpful, empty: "還沒有人按「沒幫助」" },
  { key: "error", label: "錯誤", count: (s) => s.errors, empty: "這段期間沒有錯誤" },
];

function Outcome({ q }: { q: QuestionItem }) {
  if (q.outcome === "error") return <span className="text-red-700">錯誤</span>;
  if (q.outcome === "no_match") return <span className="text-amber-700">找不到資料</span>;
  if (q.outcome === "stopped") return <span>使用者中斷</span>;
  if (q.topSimilarity !== null && q.topSimilarity < LOW_SIMILARITY) return <span className="text-amber-700">相似度 {q.topSimilarity.toFixed(2)}</span>;
  return <span>{q.cited.length ? `引用 ${q.cited.length} 個來源` : "已回答"}</span>;
}

/**
 * What people asked, newest first. A row opens in place to show the whole
 * question, what it cited and how long the first word took — no modal, the
 * list stays where it was. The tab counts are the window's totals.
 */
export function QuestionsPanel({ workspaceKey, days, summary }: { workspaceKey: string; days: PeriodDays; summary: CountSummary }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fromUrl = params.get("filter");
  const [filter, setFilter] = useState<QuestionFilter>(FILTERS.some((f) => f.key === fromUrl) ? (fromUrl as QuestionFilter) : "all");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [items, setItems] = useState<QuestionItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(
    async (before: string | null): Promise<QuestionPage> => {
      const qs = new URLSearchParams({ days: String(days), filter });
      if (term) qs.set("q", term);
      if (before) qs.set("before", before);
      const res = await fetch(`/api/analytics/workspaces/${workspaceKey}/questions?${qs}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      return body as QuestionPage;
    },
    [days, filter, term, workspaceKey],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPage(null)
      .then((p) => {
        if (cancelled) return;
        setItems(p.items);
        setNext(p.nextBefore);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const choose = (f: QuestionFilter) => {
    setFilter(f);
    setOpen(null);
    const qs = new URLSearchParams(params.toString());
    if (f === "all") qs.delete("filter");
    else qs.set("filter", f);
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
  };

  const loadMore = async () => {
    if (!next) return;
    setLoading(true);
    try {
      const p = await fetchPage(next);
      setItems((prev) => [...prev, ...p.items]);
      setNext(p.nextBefore);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const current = FILTERS.find((f) => f.key === filter)!;

  return (
    <section className="flex min-w-0 flex-col">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">問了什麼</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">點一題，看完整問題、引用了什麼、花了多久。</p>
        </div>
        <label className="relative block w-full sm:w-60">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋問題"
            aria-label="搜尋問題"
            className="h-8 w-full rounded-lg border bg-background pl-8 pr-3 text-[13px] outline-none transition-shadow placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-engenius-blue/25"
          />
        </label>
      </header>
      <div className="min-w-0 overflow-hidden rounded-xl border bg-background">
        <div role="tablist" aria-label="篩選問題" className="flex gap-1 overflow-x-auto border-b px-2">
          {FILTERS.map((f) => {
            const n = f.count(summary);
            const on = f.key === filter;
            return (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => choose(f.key)}
                className={cn(
                  "relative -mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-2.5 text-[13px] transition-colors",
                  on ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
                <span className={cn("tabular-nums text-[11.5px]", on ? "text-foreground/70" : "text-muted-foreground/80")}>{fmtInt(n)}</span>
              </button>
            );
          })}
        </div>

        {error && <p className="border-b bg-red-50 px-4 py-2 text-[12.5px] text-red-800">讀取失敗：{error}</p>}

        {items.length === 0 && !loading ? (
          <EmptyState title={term ? `沒有符合「${term}」的問題` : current.empty} />
        ) : (
          <ul className={cn("divide-y transition-opacity duration-200", loading && "opacity-60")}>
            {items.map((q) => {
              const expanded = open === q.id;
              return (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : q.id)}
                    aria-expanded={expanded}
                    className="flex w-full items-start gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                  >
                    <span className="w-[72px] shrink-0 pt-0.5 text-[12px] tabular-nums text-muted-foreground" title={shortDate(q.at)}>
                      {relativeTime(q.at)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[14px] leading-snug text-foreground", !expanded && "line-clamp-2")}>
                        {q.question ?? <span className="text-muted-foreground">（問題內容已超過保存期限）</span>}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
                        <Outcome q={q} />
                        <span>{q.who}</span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 pt-0.5">
                      {q.feedback === 1 && <ThumbsUp className="size-3.5 text-emerald-600" aria-label="有幫助" />}
                      {q.feedback === -1 && <ThumbsDown className="size-3.5 text-amber-600" aria-label="沒幫助" />}
                      <ChevronDown className={cn("size-4 text-muted-foreground/60 transition-transform duration-200", expanded && "rotate-180")} />
                    </span>
                  </button>
                  {expanded && <QuestionDetail q={q} />}
                </li>
              );
            })}
          </ul>
        )}

        {next && (
          <div className="border-t px-4 py-2.5 text-center">
            <Button variant="ghost" size="sm" onClick={loadMore} disabled={loading}>
              {loading ? "載入中…" : "載入更多"}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function QuestionDetail({ q }: { q: QuestionItem }) {
  const facts: [string, React.ReactNode][] = [
    ["時間", new Date(q.at).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })],
    ["找到的資料", q.outcome === "error" ? "—" : `${q.matchCount} 筆${q.topSimilarity !== null ? `，最接近的 ${q.topSimilarity.toFixed(2)}` : ""}`],
    ["第一個字出現", fmtMs(q.firstTokenMs)],
    ["模型", q.model ? <span className="font-mono text-[12px]">{q.model}</span> : "—"],
  ];
  return (
    <div className="border-t border-dashed bg-muted/20 px-4 py-3 pl-[104px] text-[12.5px]">
      {q.error && <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 font-mono text-[12px] leading-relaxed text-red-800">{q.error}</p>}
      <dl className="grid grid-cols-[88px_1fr] gap-x-4 gap-y-1.5">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-foreground">{v}</dd>
          </div>
        ))}
        <dt className="text-muted-foreground">引用</dt>
        <dd className="text-foreground">
          {q.cited.length ? (
            <ul className="space-y-0.5">
              {q.cited.map((c) => (
                <li key={c.title}>{c.title}</li>
              ))}
            </ul>
          ) : (
            <span className="text-muted-foreground">{q.outcome === "no_match" ? "知識庫裡找不到相關資料" : "回答沒有引用來源"}</span>
          )}
        </dd>
      </dl>
    </div>
  );
}
