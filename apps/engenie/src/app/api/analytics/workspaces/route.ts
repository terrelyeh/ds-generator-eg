import { NextResponse } from "next/server";
import { gate } from "@eg/auth/session";
import { parsePeriod } from "@/lib/analytics/period";
import { getOverview } from "@/lib/analytics/queries";

/** GET /api/analytics/workspaces?days=7|30|90 — Settings ▸ Workspace 分析, overview. */
export async function GET(request: Request) {
  const denied = await gate("analytics.view");
  if (denied) return denied;
  const days = parsePeriod(new URL(request.url).searchParams.get("days"));
  try {
    return NextResponse.json(await getOverview(days), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[analytics] overview failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "讀取分析資料失敗" }, { status: 500 });
  }
}
