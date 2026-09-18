import { GLOBAL_SOLUTION_SLUG, type TaxonomyValue } from "./taxonomy-picker";

/** One logical knowledge source (a row in the documents index, grouped). */
export interface SourceItem {
  source_type: string;
  source_id: string;
  title: string;
  chunks: number;
  total_tokens: number;
  last_updated: string;
  product_line?: string | null;
  space_label?: string | null;
  space_url?: string | null;
  doc_label?: string | null;
  tab_name?: string | null;
  page_url?: string | null;
  web_label?: string | null;
  // Unified taxonomy
  solution?: string | null;
  product_lines?: string[];
  models?: string[];
}

export interface SourceTypeStats {
  count: number;
  sources: number;
  total_tokens: number;
  last_updated: string | null;
}

/**
 * The stored GitBook update check, as the page reads it.
 *
 * `import type` on purpose: the module it comes from talks to the database,
 * and a value import here would pull the admin client into the browser
 * bundle. The shape is defined once, in lib/rag/gitbook-check.ts.
 */
export type { GitbookCheck, SpacePending } from "@/lib/rag/gitbook-check";

/** Loose shape of POST /api/documents ingest responses (fields vary by type). */
export interface IngestResponse {
  ok: boolean;
  error?: string;
  processed?: number;
  skipped?: number;
  chunks?: number;
  pages_fetched?: number;
  pages_skipped?: number;
  /** GitBook pages a crawl left when its deadline passed — press Sync again. */
  pages_deferred?: number;
  images_described?: number;
  articles_fetched?: number;
  tabs_found?: number;
  methods?: Record<string, number>;
  errors?: unknown[];
  stored?: boolean;
  truncated?: boolean;
  [key: string]: unknown;
}

export function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Pages known to be new or changed in a GitBook space.
 *
 * Mirrors `pendingPageCount` in lib/rag/gitbook-plan.ts, which cannot be
 * imported here: that module reaches for node:crypto and this one runs in the
 * browser. `undated` is deliberately not counted — see that comment.
 */
export function pendingPages(s: { changed: number; added: number }): number {
  return s.changed + s.added;
}

export function formatTokens(tokens: number) {
  if (tokens < 1000) return `${tokens}`;
  return `${(tokens / 1000).toFixed(1)}k`;
}

/** Convert UI TaxonomyValue → API payload (maps the Global sentinel to null). */
export function taxonomyToPayload(v: TaxonomyValue) {
  return {
    solution: v.solution === GLOBAL_SOLUTION_SLUG ? null : v.solution,
    product_lines: v.product_lines,
    models: v.models,
  };
}

/** TaxonomyValue from a stored {solution, product_lines, models} meta. */
export function taxValueFrom(t?: { solution: string | null; product_lines?: string[]; models?: string[] }): TaxonomyValue {
  return {
    solution: t?.solution ?? GLOBAL_SOLUTION_SLUG,
    product_lines: t?.product_lines ?? [],
    models: t?.models ?? [],
  };
}

/**
 * The one place every JSON ingest funnels through. Always tags
 * `action: "ingest"` and POSTs to /api/documents; callers format their own
 * success toast from the returned fields. (File upload uses a separate
 * multipart endpoint and does not go through here.)
 */
export async function postIngest(body: Record<string, unknown>): Promise<IngestResponse> {
  const res = await fetch("/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "ingest", ...body }),
  });
  return res.json();
}

/**
 * Ask for a fresh GitBook update check — reads each space's sitemap, crawls
 * nothing. The weekly job runs the same check; this is the button for when
 * somebody wants the answer now.
 */
export async function postGitbookCheck(): Promise<IngestResponse> {
  const res = await fetch("/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "check", source_type: "gitbook" }),
  });
  return res.json();
}
