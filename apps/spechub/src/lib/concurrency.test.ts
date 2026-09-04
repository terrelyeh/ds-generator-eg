import { describe, expect, it } from "vitest";
import { mapConcurrent } from "./concurrency";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe("mapConcurrent", () => {
  it("never has more than `limit` calls in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapConcurrent(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await sleep(2);
      inFlight -= 1;
    });
    // Exactly the limit: all four lanes start at once, and never a fifth.
    expect(peak).toBe(4);
  });

  it("returns results in input order even when items finish out of order", async () => {
    const delays = [30, 5, 20, 1, 10];
    const settled = await mapConcurrent(delays, 5, async (ms, i) => {
      await sleep(ms);
      return i;
    });
    expect(settled.map((s) => (s.status === "fulfilled" ? s.value : -1))).toEqual([0, 1, 2, 3, 4]);
  });

  it("isolates a rejection to its own slot", async () => {
    const settled = await mapConcurrent([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n * 10;
    });
    expect(settled[0]).toEqual({ status: "fulfilled", value: 10 });
    expect(settled[1].status).toBe("rejected");
    expect(settled[2]).toEqual({ status: "fulfilled", value: 30 });
  });

  it("handles an empty input and refuses a limit that would run nothing", async () => {
    expect(await mapConcurrent([], 3, async () => 1)).toEqual([]);
    await expect(mapConcurrent([1], 0, async () => 1)).rejects.toThrow(RangeError);
  });
});
