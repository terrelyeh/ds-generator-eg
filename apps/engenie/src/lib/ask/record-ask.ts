import { createAdminClient } from "@eg/db/admin";
import { logIfDbError } from "@eg/db/errors";
import type { AskRequestLog } from "@/lib/ask/ask-log";
import { rpc } from "@/lib/analytics/rpc";

/**
 * Write one ask_requests row. Called once per request, after the answer has
 * finished streaming. Never throws: losing an analytics row must not turn a
 * good answer into a failed one.
 */
export async function recordAskRequest(log: AskRequestLog): Promise<void> {
  try {
    const res = await createAdminClient()
      .from("ask_requests" as "products")
      .insert({
        ...log,
        question: log.question.slice(0, 4000),
        question_chars: log.question.length,
        error: log.error ? log.error.slice(0, 500) : null,
      } as never);
    logIfDbError("ask_requests insert", res);
  } catch (e) {
    console.warn("[ask] request not logged:", e instanceof Error ? e.message : e);
  }
}

/**
 * Clear question text past the retention window (ask_requests_redact). The
 * counts, outcomes and sources stay; only what the person typed goes.
 */
export async function redactOldAskQuestions(days = 90): Promise<void> {
  const res = await rpc<number>("ask_requests_redact", { p_days: days });
  logIfDbError("ask_requests_redact", res);
}
