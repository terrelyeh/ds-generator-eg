import { createAdminClient } from "@eg/db/admin";
import { rpc, type RpcResult } from "./rpc";
import { periodRange } from "./period";
import { entryLabel, workspaceStatus } from "./status";
import { visitorLabel } from "./format";
import {
  LOW_SIMILARITY,
  type AnalyticsOverview, type CountSummary, type DailyPoint, type ErrorItem, type GapItem, type GapReason,
  type ModelSpend, type PeriodDays, type PeriodRange, type QuestionFilter, type QuestionItem, type QuestionPage,
  type RowKind, type SourceItem, type Totals, type WorkspaceDetail, type WorkspaceRow, type WorkspaceSummary,
} from "./types";

/*
 * Server-side reads for Settings ▸ Workspace 分析. Counts come from the
 * ask_analytics_* functions (migration 00060) so nothing here pages through
 * raw rows; only the question list does, 30 at a time.
 */

interface SummaryRow {
  key: string; questions: number; answered: number; no_match: number; errors: number; stopped: number;
  rate_limited: number; low_similarity: number; visitors: number; helpful: number; unhelpful: number;
  first_token_p50_ms: number | null;
}
interface DailyRow { key: string; day: string; answered: number; no_match: number; errors: number }
interface GapRow { key: string; question: string; times: number; last_at: string; reason: GapReason; best_similarity: number | null }
interface SourceRow { title: string; source_type: string; times: number }
interface SpendRow { key: string; model: string; calls: number; tokens: number | string; cost: number | string; byok_calls: number }
interface WorkspaceMeta {
  slug: string; name: string; enabled: boolean; passcode_hash: string | null;
  allowed_origins: string[] | null; request_count: number | null; last_used_at: string | null;
}

const PAGE_SIZE = 30;
const EMPTY: CountSummary = {
  questions: 0, answered: 0, noMatch: 0, errors: 0, stopped: 0, rateLimited: 0,
  lowSimilarity: 0, visitors: 0, helpful: 0, unhelpful: 0, firstTokenP50Ms: null,
};

function must<T>(label: string, res: RpcResult<T>): T {
  if (res.error) throw new Error(`${label}: ${res.error.message ?? "query failed"}`);
  return res.data as T;
}

const toSummary = (r: SummaryRow | undefined): CountSummary =>
  r
    ? {
        questions: r.questions, answered: r.answered, noMatch: r.no_match, errors: r.errors, stopped: r.stopped,
        rateLimited: r.rate_limited, lowSimilarity: r.low_similarity, visitors: r.visitors,
        helpful: r.helpful, unhelpful: r.unhelpful, firstTokenP50Ms: r.first_token_p50_ms,
      }
    : EMPTY;

const toGap = (g: GapRow): GapItem => ({
  key: g.key, question: g.question, times: g.times, lastAt: g.last_at, reason: g.reason, bestSimilarity: g.best_similarity,
});

const summaries = (from: string, to: string) =>
  rpc<SummaryRow[]>("ask_analytics_summary", { p_from: from, p_to: to, p_low_sim: LOW_SIMILARITY });
const spend = (from: string, to: string, key: string | null = null) =>
  rpc<SpendRow[]>("ask_analytics_spend", { p_from: from, p_to: to, p_key: key });

async function workspacesMeta(slug?: string): Promise<WorkspaceMeta[]> {
  let q = createAdminClient()
    .from("ask_workspaces" as "products")
    .select("slug, name, enabled, passcode_hash, allowed_origins, request_count, last_used_at")
    .order("created_at");
  if (slug) q = q.eq("slug", slug);
  const { data, error } = (await q) as { data: WorkspaceMeta[] | null; error: { message: string } | null };
  if (error) throw new Error(`ask_workspaces: ${error.message}`);
  return data ?? [];
}

async function loggingSince(): Promise<string | null> {
  const { data, error } = (await createAdminClient()
    .from("ask_requests" as "products")
    .select("created_at")
    .order("created_at", { ascending: true })
    .limit(1)) as { data: { created_at: string }[] | null; error: { message: string } | null };
  if (error) throw new Error(`ask_requests: ${error.message}`);
  return data?.[0]?.created_at ?? null;
}

async function lastSeen(): Promise<Map<string, string>> {
  const rows = must("last_seen", await rpc<{ key: string; last_at: string }[]>("ask_analytics_last_seen")) ?? [];
  return new Map(rows.map((r) => [r.key, r.last_at]));
}

const latest = (...values: (string | null | undefined)[]): string | null =>
  values.filter((v): v is string => !!v).sort().at(-1) ?? null;

const costOf = (rows: SpendRow[], key: string) => rows.filter((r) => r.key === key).reduce((s, r) => s + Number(r.cost), 0);

interface RowSeed { key: string; name: string; kind: RowKind; entry: string; passcode: boolean; enabled: boolean; everUsed: boolean; lastAt: string | null }

/** The rows the dashboard lists: every workspace, then internal /ask, then the demo when it saw use. */
function rowSeeds(meta: WorkspaceMeta[], seen: Map<string, string>, keysWithData: Set<string>): RowSeed[] {
  const seeds: RowSeed[] = meta.map((w) => {
    const lastAt = latest(w.last_used_at, seen.get(w.slug));
    return {
      key: w.slug, name: w.name, kind: "workspace", entry: entryLabel(w.slug, w.allowed_origins),
      passcode: !!w.passcode_hash, enabled: w.enabled, everUsed: (w.request_count ?? 0) > 0 || !!lastAt, lastAt,
    };
  });
  seeds.push({ key: "internal", name: "內部 /ask", kind: "internal", entry: "登入後使用", passcode: false, enabled: true, everUsed: true, lastAt: seen.get("internal") ?? null });
  if (keysWithData.has("demo") || seen.has("demo")) {
    seeds.push({ key: "demo", name: "EnGenie Demo 頁", kind: "demo", entry: "/demo", passcode: true, enabled: true, everUsed: true, lastAt: seen.get("demo") ?? null });
  }
  return seeds;
}

function summarize(seed: RowSeed, cur: CountSummary, prev: CountSummary, cost: number): WorkspaceSummary {
  return {
    ...seed, current: cur, previous: prev, cost,
    status: workspaceStatus({ ...seed, questions: cur.questions, noMatch: cur.noMatch, errors: cur.errors, spend: cost }),
  };
}

function totalsOf(rows: WorkspaceSummary[], pick: "current" | "previous", costs: Map<string, number>): Totals {
  const ws = rows.filter((r) => r.kind === "workspace");
  return {
    questions: rows.reduce((s, r) => s + r[pick].questions, 0),
    noMatch: rows.reduce((s, r) => s + r[pick].noMatch, 0),
    errors: rows.reduce((s, r) => s + r[pick].errors, 0),
    cost: [...costs.values()].reduce((s, c) => s + c, 0),
    activeWorkspaces: ws.filter((r) => r[pick].questions > 0 || (costs.get(r.key) ?? 0) > 0).length,
    totalWorkspaces: ws.length,
  };
}

const byKey = (rows: SpendRow[]) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.key, (m.get(r.key) ?? 0) + Number(r.cost));
  return m;
};

export async function getOverview(days: PeriodDays): Promise<AnalyticsOverview> {
  const range = periodRange(days);
  const db = createAdminClient();
  const [cur, prev, daily, spendCur, spendPrev, gaps, seen, meta, since, errs] = await Promise.all([
    summaries(range.from, range.to),
    summaries(range.prevFrom, range.prevTo),
    rpc<DailyRow[]>("ask_analytics_daily", { p_from: range.from, p_to: range.to, p_key: null }),
    spend(range.from, range.to),
    spend(range.prevFrom, range.prevTo),
    rpc<GapRow[]>("ask_analytics_gaps", { p_from: range.from, p_to: range.to, p_key: null, p_low_sim: LOW_SIMILARITY, p_limit: 8 }),
    lastSeen(),
    workspacesMeta(),
    loggingSince(),
    db.from("ask_requests" as "products")
      .select("id, created_at, workspace, channel, question, error, model")
      .eq("outcome", "error").gte("created_at", range.from)
      .order("created_at", { ascending: false }).limit(6) as unknown as Promise<RpcResult<{ id: string; created_at: string; workspace: string | null; channel: string; question: string | null; error: string | null; model: string | null }[]>>,
  ]);
  const curRows = must("summary", cur) ?? [], prevRows = must("summary (previous)", prev) ?? [];
  const dailyRows = must("daily", daily) ?? [];
  const spendNow = must("spend", spendCur) ?? [], spendBefore = must("spend (previous)", spendPrev) ?? [];

  const withData = new Set([...curRows, ...prevRows].map((r) => r.key));
  const costsNow = byKey(spendNow), costsBefore = byKey(spendBefore);
  const index = new Map(range.dayKeys.map((d, i) => [d, i]));
  const series = (key: string | null) => {
    const q = Array(range.days).fill(0) as number[], nm = Array(range.days).fill(0) as number[];
    for (const r of dailyRows) {
      if (key !== null && r.key !== key) continue;
      const i = index.get(String(r.day).slice(0, 10));
      if (i === undefined) continue;
      q[i] += r.answered + r.no_match + r.errors;
      nm[i] += r.no_match;
    }
    return { q, nm };
  };

  const summariesNow: WorkspaceSummary[] = [];
  const rows: WorkspaceRow[] = rowSeeds(meta, seen, withData).map((seed) => {
    const s = summarize(seed, toSummary(curRows.find((r) => r.key === seed.key)), toSummary(prevRows.find((r) => r.key === seed.key)), costsNow.get(seed.key) ?? 0);
    summariesNow.push(s);
    return { ...s, daily: series(seed.key).q };
  });
  const all = series(null);

  return {
    range,
    generatedAt: new Date().toISOString(),
    loggingSince: since,
    totals: { current: totalsOf(summariesNow, "current", costsNow), previous: totalsOf(summariesNow, "previous", costsBefore) },
    dailyQuestions: all.q,
    dailyNoMatch: all.nm,
    rows,
    gaps: (must("gaps", gaps) ?? []).map(toGap),
    errors: (must("errors", errs) ?? []).map((e): ErrorItem => ({
      id: e.id, key: e.workspace ?? e.channel, at: e.created_at, question: e.question, error: e.error ?? "Unknown error", model: e.model,
    })),
  };
}

export async function getWorkspaceDetail(key: string, days: PeriodDays): Promise<WorkspaceDetail | null> {
  const range = periodRange(days);
  const isWorkspace = key !== "internal" && key !== "demo";
  const [meta, cur, prev, daily, spendRows, gaps, sources, seen, since] = await Promise.all([
    isWorkspace ? workspacesMeta(key) : Promise.resolve([] as WorkspaceMeta[]),
    summaries(range.from, range.to),
    summaries(range.prevFrom, range.prevTo),
    rpc<DailyRow[]>("ask_analytics_daily", { p_from: range.from, p_to: range.to, p_key: key }),
    spend(range.from, range.to, key),
    rpc<GapRow[]>("ask_analytics_gaps", { p_from: range.from, p_to: range.to, p_key: key, p_low_sim: LOW_SIMILARITY, p_limit: 12 }),
    rpc<SourceRow[]>("ask_analytics_sources", { p_from: range.from, p_to: range.to, p_key: key, p_limit: 8 }),
    lastSeen(),
    loggingSince(),
  ]);
  if (isWorkspace && meta.length === 0) return null;

  const seed = rowSeeds(meta, seen, new Set([key])).find((s) => s.key === key);
  if (!seed) return null;
  const spendList = must("spend", spendRows) ?? [];
  const workspace = summarize(
    seed,
    toSummary((must("summary", cur) ?? []).find((r) => r.key === key)),
    toSummary((must("summary (previous)", prev) ?? []).find((r) => r.key === key)),
    costOf(spendList, key),
  );

  const byDay = new Map((must("daily", daily) ?? []).map((r) => [String(r.day).slice(0, 10), r]));
  const points: DailyPoint[] = range.dayKeys.map((day) => {
    const r = byDay.get(day);
    return { day, answered: r?.answered ?? 0, noMatch: r?.no_match ?? 0, errors: r?.errors ?? 0 };
  });

  return {
    range,
    generatedAt: new Date().toISOString(),
    loggingSince: since,
    workspace,
    daily: points,
    gaps: (must("gaps", gaps) ?? []).map(toGap),
    sources: (must("sources", sources) ?? []).map((s): SourceItem => ({ title: s.title, sourceType: s.source_type, times: s.times })),
    models: spendList
      .map((r): ModelSpend => ({ model: r.model, calls: r.calls, tokens: Number(r.tokens), cost: Number(r.cost), byokCalls: r.byok_calls }))
      .sort((a, b) => b.cost - a.cost || b.calls - a.calls),
  };
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listQuestions(
  key: string,
  range: PeriodRange,
  opts: { filter: QuestionFilter; search?: string; before?: string | null },
): Promise<QuestionPage> {
  const db = createAdminClient();
  let q = db
    .from("ask_requests" as "products")
    .select("id, created_at, question, outcome, match_count, top_similarity, cited, error, model, feedback, user_id, visitor_id, ttft_ms")
    .gte("created_at", range.from)
    .neq("outcome", "rate_limited")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE + 1);
  q = key === "internal" || key === "demo" ? q.is("workspace", null).eq("channel", key) : q.eq("workspace", key);
  if (opts.filter === "no_match") q = q.eq("outcome", "no_match");
  if (opts.filter === "error") q = q.eq("outcome", "error");
  if (opts.filter === "unhelpful") q = q.eq("feedback", -1);
  if (opts.filter === "low_similarity") q = q.eq("outcome", "answered").lt("top_similarity", LOW_SIMILARITY);
  if (opts.search?.trim()) q = q.ilike("question", `%${escapeLike(opts.search.trim().slice(0, 100))}%`);
  if (opts.before) q = q.lt("created_at", opts.before);

  type Row = {
    id: string; created_at: string; question: string | null; outcome: QuestionItem["outcome"]; match_count: number;
    top_similarity: number | null; cited: { title: string; source_type: string }[] | null; error: string | null;
    model: string | null; feedback: 1 | -1 | null; user_id: string | null; visitor_id: string | null; ttft_ms: number | null;
  };
  const { data, error } = (await q) as { data: Row[] | null; error: { message: string } | null };
  if (error) throw new Error(`ask_requests: ${error.message}`);
  const rows = data ?? [];
  const page = rows.slice(0, PAGE_SIZE);

  const userIds = [...new Set(page.map((r) => r.user_id).filter((v): v is string => !!v))];
  const people = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = (await db.from("profiles").select("id, name, email").in("id", userIds)) as {
      data: { id: string; name: string | null; email: string }[] | null;
    };
    for (const p of profiles ?? []) people.set(p.id, p.name || p.email);
  }

  return {
    items: page.map((r): QuestionItem => ({
      id: r.id, at: r.created_at, question: r.question, outcome: r.outcome, matchCount: r.match_count,
      topSimilarity: r.top_similarity, cited: (r.cited ?? []).map((c) => ({ title: c.title, source_type: c.source_type })),
      error: r.error, model: r.model, feedback: r.feedback,
      who: r.user_id ? people.get(r.user_id) ?? "同事" : visitorLabel(r.visitor_id), firstTokenMs: r.ttft_ms,
    })),
    nextBefore: rows.length > PAGE_SIZE ? page[page.length - 1].created_at : null,
  };
}
