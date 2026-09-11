/**
 * What /api/ask records about each question (ask_requests, migration 00060).
 * Pure — the write lives in record-ask.ts so this stays testable.
 */
import { citedIndexes } from "./figures";
import { normalizeCitations } from "./citations";

export type AskChannel = "workspace" | "internal" | "demo";
export type AskOutcome = "answered" | "no_match" | "error" | "stopped" | "rate_limited";

export interface CitedSource {
  title: string;
  source_type: string;
  source_id: string;
}

export interface AskRequestLog {
  id: string;
  channel: AskChannel;
  workspace: string | null;
  user_id: string | null;
  visitor_id: string | null;
  question: string;
  model: string | null;
  persona: string | null;
  profile: string | null;
  match_count: number;
  top_similarity: number | null;
  cited: CitedSource[];
  outcome: AskOutcome;
  error: string | null;
  retrieval_ms: number | null;
  ttft_ms: number | null;
  duration_ms: number | null;
}

/**
 * The anonymous id a workspace or demo browser sends. It is meant to be a
 * random id the client made up — anything else (an email, a long string,
 * markup) is dropped rather than stored.
 */
export function cleanVisitorId(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
}

/** Best similarity among the retrieved chunks, rounded like the client sees it. */
export function topSimilarity(docs: { similarity: number }[]): number | null {
  if (docs.length === 0) return null;
  return Math.round(Math.max(...docs.map((d) => d.similarity)) * 100) / 100;
}

/**
 * The sources an answer actually cited, in the order it cited them. A source
 * contributes several chunks, so it is counted once however many of its
 * chunks were cited.
 */
export function citedSources(
  answer: string,
  docs: { title: string | null; source_type: string; source_id: string }[],
): CitedSource[] {
  const seen = new Set<string>();
  const out: CitedSource[] = [];
  for (const n of citedIndexes(normalizeCitations(answer))) {
    const d = docs[n - 1];
    if (!d || seen.has(d.source_id)) continue;
    seen.add(d.source_id);
    out.push({ title: String(d.title ?? "").slice(0, 200), source_type: d.source_type, source_id: d.source_id });
  }
  return out;
}
