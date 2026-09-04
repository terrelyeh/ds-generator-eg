import { describe, expect, it } from "vitest";
import { parseFollowUps } from "./use-chat-stream";

describe("parseFollowUps", () => {
  it("splits a real follow-up block off the end", () => {
    const text = "The ECW536 supports Wi-Fi 7.\n\n---\n1. What is its PoE budget?\n2. Does it support MLO?";
    const { answer, followUps } = parseFollowUps(text);
    expect(answer).toBe("The ECW536 supports Wi-Fi 7.");
    expect(followUps).toEqual(["What is its PoE budget?", "Does it support MLO?"]);
  });

  it("leaves an answer alone when nothing after its last rule is a follow-up", () => {
    // A horizontal rule inside the answer — the topology prompt even asks for
    // one — was treated as the follow-up separator. Everything after it was
    // then filtered as "not a follow-up" and silently dropped from the answer.
    const tail = "Recommended topology: " + "the core switch uplinks each access point over a 2.5G trunk, ".repeat(5);
    const text = `## Summary\nTwo options.\n\n---\n${tail}`;
    const { answer, followUps } = parseFollowUps(text);
    expect(followUps).toEqual([]);
    expect(answer).toContain(tail.trim());
  });
});
