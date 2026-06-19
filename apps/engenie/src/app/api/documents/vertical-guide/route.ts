import { NextResponse } from "next/server";
import { gate } from "@eg/auth/session";
import { ingestVerticalGuide } from "@/lib/rag/ingest-vertical-guide";

export const maxDuration = 120;

/**
 * Vertical Guide ingest — the admin-gated path for putting an approved guide's
 * content master into the shared RAG. The skill produces + renders the guide;
 * publishing it into the knowledge base is a deliberate backend action here, so
 * the org keeps control of what enters the index (the skill never auto-indexes).
 *
 * Two ways to supply the master markdown:
 *   - mode "upload": markdown sent in the body (admin uploaded the .md)
 *   - mode "url":    a GitHub link to the master .md — fetched server-side
 *                    (host allow-listed; private repos need GITHUB_TOKEN)
 *
 * Always run dry_run first (preview which rag:✓ sections + metadata get indexed)
 * before the real write.
 */

interface GhRef {
  owner: string;
  repo: string;
  ref: string;
  path: string;
}

/** Parse a github.com/blob or raw.githubusercontent.com URL (host allow-list = SSRF guard). */
function parseGithubUrl(raw: string): GhRef | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.hostname === "github.com") {
    const m = url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
    if (m) return { owner: m[1], repo: m[2], ref: m[3], path: decodeURIComponent(m[4]) };
  }
  if (url.hostname === "raw.githubusercontent.com") {
    const m = url.pathname.match(/^\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
    if (m) return { owner: m[1], repo: m[2], ref: m[3], path: decodeURIComponent(m[4]) };
  }
  return null;
}

/** Fetch a markdown file from GitHub via the contents API (authed for private repos). */
async function fetchGithubMarkdown(raw: string): Promise<string> {
  const g = parseGithubUrl(raw);
  if (!g) {
    throw new Error(
      "Only github.com/<owner>/<repo>/blob/<ref>/<path> or raw.githubusercontent.com URLs are allowed.",
    );
  }
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  const api = `https://api.github.com/repos/${g.owner}/${g.repo}/contents/${g.path}?ref=${encodeURIComponent(g.ref)}`;
  const res = await fetch(api, {
    headers: {
      Accept: "application/vnd.github.raw+json",
      "User-Agent": "engenie-vertical-guide-ingest",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    throw new Error(
      token
        ? `GitHub fetch failed (${res.status}) — check the URL and that the token can read this repo.`
        : `GitHub fetch failed (${res.status}) — this looks like a private repo. Set GITHUB_TOKEN in the engenie environment, or upload the .md instead.`,
    );
  }
  if (!res.ok) throw new Error(`GitHub fetch failed (${res.status}).`);
  return res.text();
}

export async function POST(request: Request) {
  const denied = await gate("knowledge.edit");
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      mode?: "upload" | "url";
      markdown?: string;
      url?: string;
      source_id?: string;
      source_url?: string | null;
      solution?: string;
      product_lines?: string[];
      dry_run?: boolean;
    };

    const mode = body.mode ?? (body.url ? "url" : "upload");
    let markdown = body.markdown ?? "";
    if (mode === "url") {
      if (!body.url) return NextResponse.json({ error: "Missing url" }, { status: 400 });
      markdown = await fetchGithubMarkdown(body.url);
    }
    if (!markdown.trim()) {
      return NextResponse.json({ error: "Empty markdown — nothing to index." }, { status: 400 });
    }
    if (!body.source_id?.trim()) {
      return NextResponse.json({ error: "Missing source_id." }, { status: 400 });
    }

    const result = await ingestVerticalGuide({
      sourceId: body.source_id.trim(),
      markdown,
      sourceUrl: body.source_url ?? (mode === "url" ? body.url! : null),
      solution: body.solution?.trim() || undefined,
      productLines: body.product_lines,
      dryRun: !!body.dry_run,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
