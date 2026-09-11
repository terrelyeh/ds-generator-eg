import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { logIfDbError } from "@eg/db/errors";

/**
 * POST /api/ask/feedback   { id, value }   value: 1 helpful · -1 not helpful · 0 clear
 *
 * `id` is the ask_requests row the answer came from; /api/ask sends it in the
 * answer's metadata event. It is an unguessable UUID that only the browser
 * that asked has seen, so it is the credential here — no session or
 * workspace token needed, which is what lets the embedded widget, the
 * extension and the demo leave feedback too. Only a week-old answer or
 * newer can be changed, so an id found later in a log is worth nothing.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EDITABLE_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { id?: unknown; value?: unknown } | null;
  const id = typeof body?.id === "string" && UUID_RE.test(body.id) ? body.id : null;
  const value = body?.value === 1 || body?.value === -1 || body?.value === 0 ? body.value : null;
  if (!id || value === null) {
    return NextResponse.json({ error: "Expected { id, value: 1 | -1 | 0 }" }, { status: 400 });
  }

  const res = await createAdminClient()
    .from("ask_requests" as "products")
    .update({ feedback: value || null, feedback_at: value ? new Date().toISOString() : null } as never)
    .eq("id", id)
    .gte("created_at", new Date(Date.now() - EDITABLE_MS).toISOString())
    .select("id");
  if (!logIfDbError("ask_requests feedback", res)) {
    return NextResponse.json({ error: "Could not save the feedback" }, { status: 500 });
  }
  if (!res.data?.length) {
    return NextResponse.json({ error: "That answer is too old or doesn't exist" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
