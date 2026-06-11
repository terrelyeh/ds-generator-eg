import { NextResponse } from "next/server";
import { gateOrCron } from "@eg/auth/session";
import { ingestProducts } from "@/lib/rag/ingest-products";

// Embedding many changed products can take a while; match the other
// ingest endpoints' headroom.
export const maxDuration = 300;

/**
 * Re-index product_spec RAG chunks (cross-app touchpoint).
 *
 * The product tables are owned by SpecHub (apps/spechub) but the RAG
 * pipeline lives here. Two triggers keep the index fresh:
 *
 *   - POST — called by SpecHub's /api/sync right after a sync that changed
 *     products, with `{ models: ["ECW536", …] }` to narrow the work.
 *     Authorised via the shared CRON_SECRET bearer.
 *   - GET  — daily Vercel cron backstop (vercel.json, 09:30 TW — after
 *     SpecHub's 09:00 sync) that re-indexes everything. content_hash makes
 *     unchanged chunks free, so the full pass is cheap.
 *
 * Auth: Vercel cron (x-vercel-cron) / CRON_SECRET bearer / editor+admin.
 */
async function reindex(models?: string[]) {
  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  if (models && models.length > 0) {
    for (const modelName of models) {
      const r = await ingestProducts({ modelName, force: false });
      processed += r.processed;
      skipped += r.skipped;
      errors.push(...r.errors);
    }
  } else {
    const r = await ingestProducts({ force: false });
    processed = r.processed;
    skipped = r.skipped;
    errors.push(...r.errors);
  }

  if (errors.length > 0) {
    console.warn("[reindex-products] errors:", errors);
  }
  return { ok: true, processed, skipped, errors: errors.length };
}

export async function POST(request: Request) {
  const denied = await gateOrCron(request, "knowledge.edit");
  if (denied) return denied;

  let models: string[] | undefined;
  try {
    const body = (await request.json()) as { models?: unknown };
    if (Array.isArray(body.models)) {
      models = body.models.filter((m): m is string => typeof m === "string" && !!m);
    }
  } catch {
    // No/invalid body → full re-index.
  }

  return NextResponse.json(await reindex(models));
}

export async function GET(request: Request) {
  const denied = await gateOrCron(request, "knowledge.edit");
  if (denied) return denied;
  return NextResponse.json(await reindex());
}
