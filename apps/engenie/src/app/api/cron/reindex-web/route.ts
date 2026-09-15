import { NextResponse } from "next/server";
import { recordHeartbeat } from "@eg/db/heartbeat";
import { createAdminClient } from "@eg/db/admin";
import { gateOrCron } from "@eg/auth/session";
import { ingestGitbook } from "@/lib/rag/ingest-gitbook";
import { ingestHelpcenter } from "@/lib/rag/ingest-helpcenter";
import { ingestGoogleDoc } from "@/lib/rag/ingest-google-doc";
import { ingestWeb } from "@/lib/rag/ingest-web";
import { fetchGoogleDoc } from "@/lib/google/docs";
import { selectAll } from "@/lib/rag/select-all";
import {
  chunkList,
  requestedKinds,
  summarizeRun,
  type SourceKind,
  type UnitOutcome,
} from "@/lib/rag/reindex-web-run";
import type { TaxonomyMeta } from "@/lib/rag/taxonomy";

export const maxDuration = 300;

/**
 * When to stop STARTING work, counted from the start of the request.
 *
 * Vercel kills the function at `maxDuration`, and nothing after that runs —
 * not the heartbeat, not a log line. That is how both scheduled runs so far
 * ended (2026-09-06 and 09-13: "Task timed out after 300 seconds", nothing
 * else in the log). Work already in flight when this passes still has to
 * finish: a GitBook batch's last round of image descriptions (up to ~55s at
 * the Vision timeouts), its embeddings and upserts, or one Google Doc. 200s
 * leaves that about 100.
 */
const WORK_BUDGET_MS = 200_000;
/**
 * Help Center articles / web pages per ingest call. Both pipelines fetch a
 * whole call's list before writing any of it, so a call is the smallest step
 * the budget can stop between.
 */
const HELPCENTER_ARTICLES_PER_UNIT = 20;
const WEB_PAGES_PER_UNIT = 10;

/**
 * Weekly re-crawl of the WEB knowledge sources so Ask SpecHub stays fresh.
 *
 *   - helpcenter   → re-fetch the known article URLs
 *   - google_doc   → re-fetch each known doc (content updates)
 *   - web          → re-fetch each indexed page (Firecrawl → Jina → fetch)
 *   - gitbook      → incremental (only pages whose sitemap lastModified changed;
 *                    NEW pages in an existing space are auto-discovered)
 *
 * product_spec is intentionally EXCLUDED — it already auto-reindexes on every
 * /api/sync (daily). NEW sources (a new GitBook space, a new Google Doc, a new
 * Help Center article) still need to be added once via the Knowledge page; this
 * job only refreshes what is already indexed.
 *
 * Self-maintaining: the source list is derived from the `documents` table, and
 * each source's existing taxonomy (and label) is read back and re-applied so a
 * refresh never wipes manually-assigned Solution/Product-Line/Model tags.
 *
 * Budgeted: each source is a unit, units run one at a time, and none starts
 * after WORK_BUDGET_MS. What did not fit is named in the heartbeat and done
 * next week — GitBook resumes page by page, because it writes as it goes.
 * The heartbeat is written on every run that gets past auth, including one
 * that ran out of time or hit errors; `ok` says whether it did everything.
 *
 * Auth: CRON_SECRET bearer (what Vercel Cron sends) / editor+admin.
 * `?only=gitbook,helpcenter` narrows it for a manual run — and a narrowed run
 * does NOT write the heartbeat, or a test of one kind would stand in for a
 * weekly run that never happened.
 */
type TaxRow = {
  solution?: string | null;
  product_lines?: unknown;
  models?: unknown;
};

function taxFrom(r: TaxRow): Partial<TaxonomyMeta> {
  return {
    solution: r.solution ?? null,
    product_lines: Array.isArray(r.product_lines) ? (r.product_lines as string[]) : [],
    models: Array.isArray(r.models) ? (r.models as string[]) : [],
  };
}

type Supabase = ReturnType<typeof createAdminClient>;

/** One ingest call the run can start, or leave for next week. */
interface Unit {
  kind: SourceKind;
  target: string;
  run: (deadline: number) => Promise<{ processed: number; errors: string[]; deferredPages?: number }>;
}

/**
 * Chunk 0 of every source of one type — one row per page, tab or article.
 * Paged: the old unpaged reads stopped at 1000 rows, so sources past that were
 * never refreshed at all.
 */
function firstChunks<T>(supabase: Supabase, sourceType: string, columns: string, label: string) {
  return selectAll<T>(
    (from, to) =>
      supabase
        .from("documents" as "products")
        .select(columns)
        .eq("source_type", sourceType)
        .eq("chunk_index", 0)
        .order("id")
        .range(from, to) as unknown as PromiseLike<{ data: T[] | null; error: unknown }>,
    label,
  );
}

const TAX_COLUMNS =
  "solution:metadata->>solution, product_lines:metadata->product_lines, models:metadata->models";

async function gitbookUnits(supabase: Supabase): Promise<Unit[]> {
  const rows = await firstChunks<{ space_url: string | null; space_label: string | null } & TaxRow>(
    supabase,
    "gitbook",
    `space_url:metadata->>space_url, space_label:metadata->>space_label, ${TAX_COLUMNS}`,
    "gitbook spaces",
  );
  const spaces = new Map<string, { label: string; tax: Partial<TaxonomyMeta> }>();
  for (const r of rows) {
    if (!r.space_url || spaces.has(r.space_url)) continue;
    spaces.set(r.space_url, { label: r.space_label || r.space_url, tax: taxFrom(r) });
  }
  return [...spaces].map(([spaceUrl, { label, tax }]) => ({
    kind: "gitbook" as const,
    target: spaceUrl,
    run: async (deadline: number) => {
      const r = await ingestGitbook({
        spaceUrl,
        spaceLabel: label,
        force: false,
        enableVision: true,
        taxonomy: tax,
        deadline,
      });
      return { processed: r.processed, errors: r.errors, deferredPages: r.pages_deferred };
    },
  }));
}

async function googleDocUnits(supabase: Supabase): Promise<Unit[]> {
  const rows = await firstChunks<
    { source_id: string; source_url: string | null; doc_label: string | null } & TaxRow
  >(supabase, "google_doc", `source_id, source_url, doc_label:metadata->>doc_label, ${TAX_COLUMNS}`, "google docs");
  // A google_doc source_id is `<driveFileId>/<tabSlug>` — one row per tab.
  // Keying this map by the whole thing meant handing Drive a file id with a
  // slug glued to it, so `files.get` 404'd, the public export 404'd, and
  // the failure landed in a cron JSON that nobody reads. These documents
  // have never once been refreshed since the tab split. The UI already
  // knew to cut at the slash (knowledge-base.tsx).
  const docs = new Map<string, { url: string | null; label: string | null; tax: Partial<TaxonomyMeta> }>();
  for (const r of rows) {
    const driveFileId = r.source_id.split("/")[0];
    if (!driveFileId || docs.has(driveFileId)) continue;
    docs.set(driveFileId, { url: r.source_url, label: r.doc_label, tax: taxFrom(r) });
  }
  return [...docs].map(([docId, { url, label, tax }]) => ({
    kind: "google_doc" as const,
    target: docId,
    run: async () => {
      const fetched = await fetchGoogleDoc(docId);
      const r = await ingestGoogleDoc({
        docId,
        content: fetched.content,
        docTitle: fetched.title,
        // Same as the row's Sync button: without it a custom label is
        // replaced by the document title on every changed chunk.
        label: label || undefined,
        docUrl: url || `https://docs.google.com/document/d/${docId}`,
        force: false,
        taxonomy: tax,
      });
      return { processed: r.processed, errors: r.errors };
    },
  }));
}

/**
 * Sources grouped by (label, taxonomy), because one ingest call takes one of
 * each — then cut into units the budget can stop between.
 */
function groupedUnits(
  kind: "helpcenter" | "web",
  rows: ({ source_id: string; source_url: string | null; label: string | null } & TaxRow)[],
  perUnit: number,
  ingest: (urls: string[], label: string | null, tax: Partial<TaxonomyMeta>) => Promise<{ processed: number; errors: string[] }>,
): Unit[] {
  const seen = new Set<string>();
  const groups = new Map<string, { label: string | null; tax: Partial<TaxonomyMeta>; urls: string[] }>();
  for (const r of rows) {
    if (!r.source_url || seen.has(r.source_id)) continue;
    seen.add(r.source_id);
    const tax = taxFrom(r);
    const key = `${r.label ?? ""}::${JSON.stringify(tax)}`;
    if (!groups.has(key)) groups.set(key, { label: r.label, tax, urls: [] });
    groups.get(key)!.urls.push(r.source_url);
  }
  const noun = kind === "helpcenter" ? "article(s)" : "page(s)";
  return [...groups.values()].flatMap(({ label, tax, urls }) =>
    chunkList(urls, perUnit).map((batch) => ({
      kind,
      target: `${batch.length} ${noun}${label ? ` · ${label}` : ""}`,
      run: () => ingest(batch, label, tax),
    })),
  );
}

async function helpcenterUnits(supabase: Supabase): Promise<Unit[]> {
  const rows = await firstChunks<{ source_id: string; source_url: string | null; label: string | null } & TaxRow>(
    supabase,
    "helpcenter",
    `source_id, source_url, label:metadata->>helpcenter_label, ${TAX_COLUMNS}`,
    "help center articles",
  );
  return groupedUnits("helpcenter", rows, HELPCENTER_ARTICLES_PER_UNIT, async (urls, label, tax) => {
    const r = await ingestHelpcenter({
      collectionUrls: [],
      articleUrls: urls,
      label: label || "EnGenius Help Center",
      force: false,
      taxonomy: tax,
    });
    return { processed: r.processed, errors: r.errors };
  });
}

async function webUnits(supabase: Supabase): Promise<Unit[]> {
  const rows = await firstChunks<{ source_id: string; source_url: string | null; label: string | null } & TaxRow>(
    supabase,
    "web",
    `source_id, source_url, label:metadata->>web_label, ${TAX_COLUMNS}`,
    "web pages",
  );
  return groupedUnits("web", rows, WEB_PAGES_PER_UNIT, async (urls, label, tax) => {
    const r = await ingestWeb({ pageUrls: urls, label: label || undefined, force: false, taxonomy: tax });
    return { processed: r.processed, errors: r.errors };
  });
}

const DISCOVER: Record<SourceKind, (supabase: Supabase) => Promise<Unit[]>> = {
  helpcenter: helpcenterUnits,
  google_doc: googleDocUnits,
  web: webUnits,
  gitbook: gitbookUnits,
};

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function runUnit(unit: Unit, deadline: number): Promise<UnitOutcome> {
  const startedAt = Date.now();
  try {
    const r = await unit.run(deadline);
    const outcome: UnitOutcome = {
      kind: unit.kind,
      target: unit.target,
      status: "done",
      errors: r.errors,
      ms: Date.now() - startedAt,
      processed: r.processed,
      deferredPages: r.deferredPages ?? 0,
    };
    // One line per unit, so the next slow run shows where its time went —
    // the two that timed out left nothing but the timeout.
    console.info(
      `[reindex-web] ${unit.kind} ${unit.target}: ${(outcome.ms / 1000).toFixed(1)}s, ` +
        `${r.processed} written` +
        (outcome.deferredPages ? `, ${outcome.deferredPages} page(s) left` : "") +
        (r.errors.length ? `, ${r.errors.length} error(s) — ${r.errors[0]}` : ""),
    );
    return outcome;
  } catch (err) {
    const ms = Date.now() - startedAt;
    console.error(`[reindex-web] ${unit.kind} ${unit.target}: failed after ${(ms / 1000).toFixed(1)}s — ${messageOf(err)}`);
    return { kind: unit.kind, target: unit.target, status: "failed", errors: [messageOf(err)], ms, processed: 0, deferredPages: 0 };
  }
}

async function handle(request: Request) {
  const denied = await gateOrCron(request, "knowledge.edit");
  if (denied) return denied;

  const startedAt = Date.now();
  const deadline = startedAt + WORK_BUDGET_MS;
  const only = new URL(request.url).searchParams.get("only");
  const outcomes: UnitOutcome[] = [];
  let fatal: string | undefined;

  try {
    const supabase = createAdminClient();
    for (const kind of requestedKinds(only)) {
      let units: Unit[];
      try {
        units = await DISCOVER[kind](supabase);
      } catch (err) {
        outcomes.push({ kind, target: "source list", status: "failed", errors: [messageOf(err)], ms: 0, processed: 0, deferredPages: 0 });
        continue;
      }
      for (const unit of units) {
        if (Date.now() >= deadline) {
          outcomes.push({ kind, target: unit.target, status: "deferred", errors: [], ms: 0, processed: 0, deferredPages: 0 });
          continue;
        }
        outcomes.push(await runUnit(unit, deadline));
      }
    }
  } catch (err) {
    // Nothing above is expected to throw past its own catch. If something
    // does, the heartbeat below is still the point.
    fatal = messageOf(err);
  }

  const elapsedMs = Date.now() - startedAt;
  const verdict = summarizeRun(outcomes, elapsedMs, fatal);
  console.info(`[reindex-web] ${verdict.ok ? "ok" : "NOT ok"} · ${verdict.detail}`);
  if (!only) await recordHeartbeat("reindex-web", verdict.ok, verdict.detail);

  return NextResponse.json({
    ok: verdict.ok,
    timestamp: new Date().toISOString(),
    elapsed_ms: elapsedMs,
    heartbeat: only ? "skipped (narrowed run)" : "recorded",
    detail: verdict.detail,
    outcomes: outcomes.map((o) => ({ ...o, errors: o.errors.slice(0, 20) })),
  });
}

export async function POST(request: Request) {
  return handle(request);
}

// GET allowed too (Vercel cron issues GET; also handy for manual browser test).
export async function GET(request: Request) {
  return handle(request);
}
