import { describe, expect, it } from "vitest";
import {
  HISTORY_MSG_CHAR_CAP,
  HISTORY_TOTAL_CHAR_BUDGET,
  trimHistory,
  type ChatMessage,
} from "./history";

const msg = (role: ChatMessage["role"], content: string): ChatMessage => ({ role, content });

describe("trimHistory", () => {
  it("keeps a short conversation whole and in order", () => {
    const history = [msg("user", "What is the PoE budget?"), msg("assistant", "370 W.")];
    expect(trimHistory(history)).toEqual(history);
  });

  it("keeps the NEWEST turns when the budget runs out", () => {
    // It walks backwards on purpose: the recent turns are the context for
    // the question being asked. Dropping from the wrong end would keep an
    // opening pleasantry and discard what the user just said.
    const history = Array.from({ length: 40 }, (_, i) => msg(i % 2 ? "assistant" : "user", `turn ${i} `.padEnd(1000, "x")));
    const kept = trimHistory(history);
    expect(kept.length).toBeLessThan(history.length);
    expect(kept[kept.length - 1].content).toContain("turn 39");
    expect(kept[0].content).not.toContain("turn 0");
    const total = kept.reduce((n, m) => n + m.content.length, 0);
    expect(total).toBeLessThanOrEqual(HISTORY_TOTAL_CHAR_BUDGET);
  });

  it("truncates one over-long message rather than dropping it", () => {
    const kept = trimHistory([msg("assistant", "y".repeat(5000))]);
    expect(kept).toHaveLength(1);
    expect(kept[0].content).toHaveLength(HISTORY_MSG_CHAR_CAP + " …(truncated)".length);
    expect(kept[0].content.endsWith(" …(truncated)")).toBe(true);
  });

  it("preserves each message's role", () => {
    const kept = trimHistory([msg("user", "a"), msg("assistant", "b"), msg("user", "c")]);
    expect(kept.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });

  it("handles an empty history", () => {
    expect(trimHistory([])).toEqual([]);
  });
});
