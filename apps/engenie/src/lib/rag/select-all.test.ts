import { describe, expect, it } from "vitest";
import { selectAll } from "./select-all";

/** A table of `n` rows served the way PostgREST does: `range` asked, `cap` enforced. */
function table(n: number, cap: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i }));
  const calls: [number, number][] = [];
  const query = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, Math.min(to + 1, from + cap)), error: null };
  };
  return { query, calls };
}

describe("selectAll", () => {
  it("reads past the thousand-row cap that used to truncate the ingest reads", async () => {
    const { query } = table(2500, 1000);
    const rows = await selectAll(query, "documents");
    expect(rows).toHaveLength(2500);
    expect(rows.at(-1)).toEqual({ id: 2499 });
  });

  it("skips nothing when the server caps below the page size", async () => {
    // Advancing by the requested size would jump from 0 to 1000 and lose 400..999.
    const { query } = table(1000, 400);
    const rows = await selectAll(query, "documents", 1000);
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 1000 }, (_, i) => i));
  });

  it("stops on the first empty page, including for an empty table", async () => {
    const empty = table(0, 1000);
    expect(await selectAll(empty.query, "documents")).toEqual([]);
    expect(empty.calls).toEqual([[0, 999]]);

    const exact = table(1000, 1000);
    await selectAll(exact.query, "documents");
    expect(exact.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("throws on a failed read instead of answering with a partial list", async () => {
    let page = 0;
    const query = async () =>
      page++ === 0
        ? { data: [{ id: 0 }], error: null }
        : { data: null, error: { message: "canceling statement due to statement timeout" } };
    await expect(selectAll(query, "gitbook existing chunks", 1)).rejects.toThrow(
      /gitbook existing chunks: .*statement timeout/,
    );
  });
});
