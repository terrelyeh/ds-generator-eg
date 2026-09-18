import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate, getCurrentUser } from "@eg/auth/session";
import { applyMarks, isMarkLocale, MarkError, type MarkChange } from "@/lib/website/marks";

/**
 * 可上架 / 不上架 marks.
 *
 *   POST { changes: [{ productId, locale, decision }] }
 *     decision: "ready" (可上架) · "skip" (不上架) · "clear" (取消)
 *
 * A mark is made for the language's latest version as it is at that moment;
 * see applyMarks. Batches come from the 上架追蹤 tab's multi-select.
 */
export const dynamic = "force-dynamic";

const DECISIONS = new Set(["ready", "skip", "clear"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const denied = await gate("website_check.mark");
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { changes?: unknown } | null;
  const raw = Array.isArray(body?.changes) ? body.changes : null;
  if (!raw || !raw.length || raw.length > 200) return NextResponse.json({ error: "需要 1–200 筆標記" }, { status: 400 });

  const changes: MarkChange[] = [];
  for (const entry of raw as { productId?: unknown; locale?: unknown; decision?: unknown }[]) {
    if (typeof entry?.productId !== "string" || !UUID.test(entry.productId) || !isMarkLocale(entry.locale) || !DECISIONS.has(entry.decision as string)) {
      return NextResponse.json({ error: "標記格式不對" }, { status: 400 });
    }
    changes.push({ productId: entry.productId, locale: entry.locale, decision: entry.decision as MarkChange["decision"] });
  }

  const user = await getCurrentUser();
  try {
    await applyMarks(createAdminClient(), user?.id ?? null, changes);
  } catch (error) {
    if (error instanceof MarkError) return NextResponse.json({ error: error.message }, { status: 422 });
    throw error;
  }
  return NextResponse.json({ ok: true, applied: changes.length });
}
