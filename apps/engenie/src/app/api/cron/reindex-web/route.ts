import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gateOrCron } from "@eg/auth/session";
import { ingestGitbook } from "@/lib/rag/ingest-gitbook";
import { ingestHelpcenter } from "@/lib/rag/ingest-helpcenter";
import { ingestGoogleDoc } from "@/lib/rag/ingest-google-doc";
import { ingestWeb } from "@/lib/rag/ingest-web";
import { fetchGoogleDoc } from "@/lib/google/docs";
import type { TaxonomyMeta } from "@/lib/rag/taxonomy";

// Match /api/documents (the route that also ingests GitBook) — 300s headroom
// for the first full crawl. After that, GitBook re-crawl is incremental
// (sitemap lastModified) so unchanged spaces cost ~nothing. Help Center
// (re-fetches all known articles) is the heaviest, so it runs LAST — a timeout
// can't lose the cheaper sources already committed before it.
export const maxDuration = 300;

/**
 * Weekly re-crawl of the WEB knowledge sources so Ask SpecHub stays fresh.
 *
 *   - gitbook      → incremental (only pages whose sitemap lastModified changed;
 *                    NEW pages in an existing space are auto-discovered)
 *   - google_doc   → re-fetch each known doc (content updates)
 *   - helpcenter   → re-fetch the known article URLs
 *   - web          → re-fetch each indexed page (Firecrawl → Jina → fetch)
 *
 * product_spec is intentionally EXCLUDED — it already auto-reindexes on every
 * /api/sync (daily). NEW sources (a new GitBook space, a new Google Doc, a new
 * Help Center article) still need to be added once via the Knowledge page; this
 * job only refreshes what is already indexed.
 *
 * Self-maintaining: the source list is derived from the `documents` table, and
 * each source's existing taxonomy is read back and re-applied so a refresh
 * never wipes manually-assigned Solution/Product-Line/Model tags.
 *
 * Auth: Vercel cron (x-vercel-cron) / CRON_SECRET bearer / editor+admin.
 * `?only=gitbook|google_doc|helpcenter|web` narrows it for manual/targeted runs.
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

async function handle(request: Request) {
  const denied = await gateOrCron(request, "knowledge.edit");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const only = searchParams.get("only");
  const want = (t: string) => !only || only === t;

  const supabase = createAdminClient();
  const summary: Record<string, unknown> = {};

  // ── GitBook (incremental — cheap when unchanged) ─────────────────────────
  if (want("gitbook")) {
    const { data } = (await supabase
      .from("documents" as "products")
      .select(
        "space_url:metadata->>space_url, space_label:metadata->>space_label, solution:metadata->>solution, product_lines:metadata->product_lines, models:metadata->models",
      )
      .eq("source_type", "gitbook")) as {
      data:
        | ({ space_url: string | null; space_label: string | null } & TaxRow)[]
        | null;
    };
    const spaces = new Map<string, { label: string; tax: Partial<TaxonomyMeta> }>();
    for (const r of data ?? []) {
      if (!r.space_url || spaces.has(r.space_url)) continue;
      spaces.set(r.space_url, { label: r.space_label || r.space_url, tax: taxFrom(r) });
    }
    const results: unknown[] = [];
    for (const [url, { label, tax }] of spaces) {
      try {
        const r = await ingestGitbook({
          spaceUrl: url,
          spaceLabel: label,
          force: false,
          enableVision: true,
          taxonomy: tax,
        });
        results.push({ space: url, processed: r.processed, pages_fetched: r.pages_fetched, pages_skipped: r.pages_skipped });
      } catch (e) {
        results.push({ space: url, error: e instanceof Error ? e.message : String(e) });
      }
    }
    summary.gitbook = results;
  }

  // ── Google Docs (re-fetch each known doc) ────────────────────────────────
  if (want("google_doc")) {
    const { data } = (await supabase
      .from("documents" as "products")
      .select(
        "source_id, source_url, solution:metadata->>solution, product_lines:metadata->product_lines, models:metadata->models",
      )
      .eq("source_type", "google_doc")) as {
      data: ({ source_id: string; source_url: string | null } & TaxRow)[] | null;
    };
    const docs = new Map<string, { url: string | null; tax: Partial<TaxonomyMeta> }>();
    for (const r of data ?? []) {
      if (docs.has(r.source_id)) continue;
      docs.set(r.source_id, { url: r.source_url, tax: taxFrom(r) });
    }
    const results: unknown[] = [];
    for (const [docId, { url, tax }] of docs) {
      try {
        const fetched = await fetchGoogleDoc(docId);
        const r = await ingestGoogleDoc({
          docId,
          content: fetched.content,
          docTitle: fetched.title,
          docUrl: url || `https://docs.google.com/document/d/${docId}`,
          force: false,
          taxonomy: tax,
        });
        results.push({ doc: docId, processed: r.processed, skipped: r.skipped });
      } catch (e) {
        results.push({ doc: docId, error: e instanceof Error ? e.message : String(e) });
      }
    }
    summary.google_doc = results;
  }

  // ── Help Center (heaviest → last) ────────────────────────────────────────
  // Re-fetches the known article URLs. Grouped by taxonomy signature so a
  // refresh preserves per-article tags (ingestHelpcenter takes one taxonomy
  // per call). Usually 1 group (web-source tags are mostly empty today).
  if (want("helpcenter")) {
    const { data } = (await supabase
      .from("documents" as "products")
      .select(
        "source_id, source_url, solution:metadata->>solution, product_lines:metadata->product_lines, models:metadata->models",
      )
      .eq("source_type", "helpcenter")) as {
      data: ({ source_id: string; source_url: string | null } & TaxRow)[] | null;
    };
    const seen = new Set<string>();
    const groups = new Map<string, { tax: Partial<TaxonomyMeta>; urls: string[] }>();
    for (const r of data ?? []) {
      if (!r.source_url || seen.has(r.source_id)) continue;
      seen.add(r.source_id);
      const tax = taxFrom(r);
      const key = JSON.stringify(tax);
      if (!groups.has(key)) groups.set(key, { tax, urls: [] });
      groups.get(key)!.urls.push(r.source_url);
    }
    const results: unknown[] = [];
    for (const { tax, urls } of groups.values()) {
      try {
        const r = await ingestHelpcenter({
          collectionUrls: [],
          articleUrls: urls,
          label: "Help Center",
          force: false,
          taxonomy: tax,
        });
        results.push({ articles: urls.length, processed: r.processed, skipped: r.skipped });
      } catch (e) {
        results.push({ articles: urls.length, error: e instanceof Error ? e.message : String(e) });
      }
    }
    summary.helpcenter = results;
  }

  // ── Web pages (re-fetch each indexed page; preserves per-page taxonomy) ───
  // Grouped by (label + taxonomy signature) so one ingestWeb call refreshes a
  // batch while keeping its label and Solution/Product-Line/Model tags.
  if (want("web")) {
    const { data } = (await supabase
      .from("documents" as "products")
      .select(
        "source_id, source_url, label:metadata->>web_label, solution:metadata->>solution, product_lines:metadata->product_lines, models:metadata->models",
      )
      .eq("source_type", "web")) as {
      data: ({ source_id: string; source_url: string | null; label: string | null } & TaxRow)[] | null;
    };
    const seen = new Set<string>();
    const groups = new Map<string, { label: string | null; tax: Partial<TaxonomyMeta>; urls: string[] }>();
    for (const r of data ?? []) {
      if (!r.source_url || seen.has(r.source_id)) continue;
      seen.add(r.source_id);
      const tax = taxFrom(r);
      const key = `${r.label ?? ""}::${JSON.stringify(tax)}`;
      if (!groups.has(key)) groups.set(key, { label: r.label, tax, urls: [] });
      groups.get(key)!.urls.push(r.source_url);
    }
    const results: unknown[] = [];
    for (const { label, tax, urls } of groups.values()) {
      try {
        const r = await ingestWeb({
          pageUrls: urls,
          label: label || undefined,
          force: false,
          taxonomy: tax,
        });
        results.push({ pages: urls.length, processed: r.processed, skipped: r.skipped, methods: r.methods });
      } catch (e) {
        results.push({ pages: urls.length, error: e instanceof Error ? e.message : String(e) });
      }
    }
    summary.web = results;
  }

  return NextResponse.json({ ok: true, timestamp: new Date().toISOString(), summary });
}

export async function POST(request: Request) {
  return handle(request);
}

// GET allowed too (Vercel cron issues GET; also handy for manual browser test).
export async function GET(request: Request) {
  return handle(request);
}
