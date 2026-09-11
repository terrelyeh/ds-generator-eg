import { NextResponse } from "next/server";
import { gate } from "@eg/auth/session";
import { parsePeriod } from "@/lib/analytics/period";
import { getWorkspaceDetail } from "@/lib/analytics/queries";

/** GET /api/analytics/workspaces/<slug | internal | demo>?days= — one workspace. */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const denied = await gate("analytics.view");
  if (denied) return denied;
  const { key } = await params;
  if (!/^[a-z0-9-]{1,64}$/.test(key)) return NextResponse.json({ error: "Unknown workspace" }, { status: 404 });
  try {
    const detail = await getWorkspaceDetail(key, parsePeriod(new URL(request.url).searchParams.get("days")));
    if (!detail) return NextResponse.json({ error: "Unknown workspace" }, { status: 404 });
    return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(`[analytics] detail ${key} failed:`, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "讀取分析資料失敗" }, { status: 500 });
  }
}
