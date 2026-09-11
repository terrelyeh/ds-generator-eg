"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";

/**
 * 👍 / 👎 under an answer. Saved against the answer's ask_requests row
 * (/api/ask/feedback) and read by Settings ▸ Workspace 分析, where a 👎 puts
 * the question on the knowledge-gap list.
 *
 * Optimistic: the choice shows at once and reverts if the save fails.
 * Pressing the same one again clears it. Renders nothing for an answer that
 * has no row to attach to (an older history item, a stopped answer).
 */
export function AnswerFeedback({
  requestId,
  authToken,
  buttonClassName,
  iconClassName = "h-3.5 w-3.5",
}: {
  requestId?: string;
  /** Embedded widgets have no cookies; they authenticate with the workspace bearer. */
  authToken?: string;
  buttonClassName: string;
  iconClassName?: string;
}) {
  const [value, setValue] = useState<0 | 1 | -1>(0);
  if (!requestId) return null;

  async function send(choice: 1 | -1) {
    const previous = value;
    const next = previous === choice ? 0 : choice;
    setValue(next);
    try {
      const res = await fetch("/api/ask/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ id: requestId, value: next }),
      });
      if (!res.ok) setValue(previous);
    } catch {
      setValue(previous);
    }
  }

  return (
    <>
      <button type="button" onClick={() => send(1)} aria-pressed={value === 1} aria-label="這個回答有幫助" title="有幫助" className={buttonClassName}>
        <ThumbsUp className={`${iconClassName} ${value === 1 ? "fill-emerald-600/15 text-emerald-600" : ""}`} />
      </button>
      <button type="button" onClick={() => send(-1)} aria-pressed={value === -1} aria-label="這個回答沒有幫助" title="沒幫助" className={buttonClassName}>
        <ThumbsDown className={`${iconClassName} ${value === -1 ? "fill-amber-600/15 text-amber-600" : ""}`} />
      </button>
    </>
  );
}
