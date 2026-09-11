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

type SourceDoc = { title: string | null; source_type: string; source_id: string; metadata?: Record<string, unknown> | null };

/**
 * A cited source named the way a person would name it: the document, not the
 * section. A chunk's own title is often a heading inside a document
 * ("Product Positioning:"), which means nothing on a list of sources.
 */
export function sourceLabel(d: SourceDoc): string {
  const m = d.metadata ?? {};
  const pick = (k: string) => {
    const v = m[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const fallback = String(d.title ?? d.source_id);
  switch (d.source_type) {
    case "google_doc": return pick("doc_title") ?? pick("doc_label") ?? fallback;
    case "gitbook": return pick("page_title") ?? fallback;
    case "helpcenter": return pick("article_title") ?? fallback;
    case "vertical_guide": return pick("guide_title") ?? fallback;
    case "text_snippet": return pick("snippet_title") ?? fallback;
    case "product_spec": return d.source_id; // the model number
    default: return fallback;
  }
}

/**
 * The sources an answer actually cited, in the order it cited them. A source
 * contributes several chunks, so it is counted once however many of its
 * chunks were cited.
 */
export function citedSources(
  answer: string,
  docs: SourceDoc[],
): CitedSource[] {
  const seen = new Set<string>();
  const out: CitedSource[] = [];
  for (const n of citedIndexes(normalizeCitations(answer))) {
    const d = docs[n - 1];
    if (!d || seen.has(d.source_id)) continue;
    seen.add(d.source_id);
    out.push({ title: sourceLabel(d).slice(0, 200), source_type: d.source_type, source_id: d.source_id });
  }
  return out;
}
