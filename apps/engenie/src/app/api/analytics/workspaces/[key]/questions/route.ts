import { NextResponse } from "next/server";
import { gate } from "@eg/auth/session";
import { parsePeriod, periodRange } from "@/lib/analytics/period";
import { listQuestions } from "@/lib/analytics/queries";
import type { QuestionFilter } from "@/lib/analytics/types";

const FILTERS: QuestionFilter[] = ["all", "no_match", "low_similarity", "error", "unhelpful"];

/**
 * GET /api/analytics/workspaces/<key>/questions?days=&filter=&q=&before=
 * What people asked, newest first, 30 at a time. Admin only: it is their words.
 */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const denied = await gate("analytics.view");
  if (denied) return denied;
  const { key } = await params;
  if (!/^[a-z0-9-]{1,64}$/.test(key)) return NextResponse.json({ error: "Unknown workspace" }, { status: 404 });
  const sp = new URL(request.url).searchParams;
  const filter = FILTERS.includes(sp.get("filter") as QuestionFilter) ? (sp.get("filter") as QuestionFilter) : "all";
  const before = sp.get("before");
  try {
    const page = await listQuestions(key, periodRange(parsePeriod(sp.get("days"))), {
      filter,
      search: sp.get("q") ?? undefined,
      before: before && !Number.isNaN(Date.parse(before)) ? before : null,
    });
    return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(`[analytics] questions ${key} failed:`, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "讀取問題失敗" }, { status: 500 });
  }
}
