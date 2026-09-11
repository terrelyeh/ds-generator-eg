/**
 * The contract between /api/analytics/* and the Workspace 分析 pages.
 * "key" is a workspace slug, or "internal" (signed-in /ask) / "demo".
 */
export type PeriodDays = 7 | 30 | 90;
export const PERIODS: PeriodDays[] = [7, 30, 90];

export interface PeriodRange {
  days: PeriodDays;
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  /** Taiwan calendar days in the window, oldest first (YYYY-MM-DD). */
  dayKeys: string[];
}

export interface CountSummary {
  questions: number;
  answered: number;
  noMatch: number;
  errors: number;
  stopped: number;
  rateLimited: number;
  lowSimilarity: number;
  visitors: number;
  helpful: number;
  unhelpful: number;
  firstTokenP50Ms: number | null;
}

export type StatusTone = "good" | "warn" | "crit" | "idle";
export interface StatusBadge {
  tone: StatusTone;
  label: string;
}

export type RowKind = "workspace" | "internal" | "demo";

export interface WorkspaceSummary {
  key: string;
  name: string;
  kind: RowKind;
  /** Where people reach it: "Chrome extension", "嵌入 <host>", "/ask/<slug>", "登入後使用". */
  entry: string;
  passcode: boolean;
  enabled: boolean;
  current: CountSummary;
  previous: CountSummary;
  /** Company-paid spend in the window, USD (BYOK excluded). */
  cost: number;
  /** All-time last question, not just within the window. */
  lastAt: string | null;
  status: StatusBadge[];
}

export interface WorkspaceRow extends WorkspaceSummary {
  /** Questions per day, aligned to range.dayKeys. */
  daily: number[];
}

export type GapReason = "no_match" | "unhelpful" | "low_similarity";
export interface GapItem {
  key: string;
  question: string;
  times: number;
  lastAt: string;
  reason: GapReason;
  bestSimilarity: number | null;
}

export interface ErrorItem {
  id: string;
  key: string;
  at: string;
  question: string | null;
  error: string;
  model: string | null;
}

export interface Totals {
  questions: number;
  noMatch: number;
  errors: number;
  cost: number;
  activeWorkspaces: number;
  totalWorkspaces: number;
}

export interface AnalyticsOverview {
  range: PeriodRange;
  generatedAt: string;
  /** First recorded question — before this there is only the spend ledger. */
  loggingSince: string | null;
  totals: { current: Totals; previous: Totals };
  /** Across every key, aligned to range.dayKeys. */
  dailyQuestions: number[];
  dailyNoMatch: number[];
  rows: WorkspaceRow[];
  gaps: GapItem[];
  errors: ErrorItem[];
}

export interface DailyPoint {
  day: string;
  answered: number;
  noMatch: number;
  errors: number;
}

export interface SourceItem {
  title: string;
  sourceType: string;
  times: number;
}

export interface ModelSpend {
  model: string;
  calls: number;
  tokens: number;
  cost: number;
  byokCalls: number;
}

export interface WorkspaceDetail {
  range: PeriodRange;
  generatedAt: string;
  loggingSince: string | null;
  workspace: WorkspaceSummary;
  daily: DailyPoint[];
  gaps: GapItem[];
  sources: SourceItem[];
  models: ModelSpend[];
}

export type QuestionFilter = "all" | "no_match" | "low_similarity" | "error" | "unhelpful";

export interface QuestionItem {
  id: string;
  at: string;
  question: string | null;
  outcome: "answered" | "no_match" | "error" | "stopped";
  matchCount: number;
  topSimilarity: number | null;
  cited: { title: string; source_type: string }[];
  error: string | null;
  model: string | null;
  feedback: 1 | -1 | null;
  /** Signed-in name/email for internal /ask; "訪客 3f2a" for anonymous browsers. */
  who: string;
  firstTokenMs: number | null;
}

export interface QuestionPage {
  items: QuestionItem[];
  /** Pass back as ?before= to get the next page; null when there is none. */
  nextBefore: string | null;
}

/** An answered question whose best match scored below this counts as a gap. Keep in step with 00060. */
export const LOW_SIMILARITY = 0.45;
