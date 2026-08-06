import { NextResponse } from "next/server";
import { getUsageSnapshot } from "@eg/llm/openrouter-account";
import { gate } from "@eg/auth/session";

/**
 * GET /api/openrouter/usage[?refresh=1]
 *
 * Company AI spend. Admin-only — this is account-level financial data,
 * so it gets its own permission rather than riding on a settings one.
 *
 * Returns partial data by design: each upstream read degrades on its own
 * and reports why in `warnings`, so a missing management key shows the
 * key-level burn rather than an empty page.
 */
export async function GET(request: Request) {
  const denied = await gate("billing.view");
  if (denied) return denied;

  const refresh = new URL(request.url).searchParams.get("refresh") === "1";

  try {
    const snapshot = await getUsageSnapshot(refresh);
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
