/**
 * Every row a query matches, not the first thousand.
 *
 * PostgREST stops a response at `db-max-rows` — 1000 on this project — and
 * says nothing when it does (spechub pitfall #23). The ingest pipelines read
 * "every chunk this source type already has" with a plain `.select()`, and
 * `documents` has been past a thousand rows per type for a while, so those
 * reads were quietly partial. For GitBook that meant pages whose rows fell
 * past the cut had no stored `last_modified`, looked new, and were fetched
 * and re-described by Vision on every weekly run.
 *
 * The caller supplies one page of the query. It must be ORDERED by a unique
 * column, or rows move between pages as they are read. Paging advances by
 * what actually came back rather than by the requested size, so a server
 * cap smaller than `pageSize` shortens the pages instead of skipping rows.
 *
 * Throws on a failed read. The old reads ignored `error`, and an empty
 * "existing chunks" answer is not harmless: every chunk then looks changed
 * and gets embedded again.
 */
export const SELECT_PAGE_SIZE = 1000;

export type PageQuery<T> = (
  from: number,
  to: number,
) => PromiseLike<{ data: T[] | null; error: unknown }>;

export async function selectAll<T>(
  query: PageQuery<T>,
  label: string,
  pageSize = SELECT_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await query(rows.length, rows.length + pageSize - 1);
    if (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object"
            ? JSON.stringify(error)
            : String(error);
      throw new Error(`${label}: ${message}`);
    }
    if (!data || data.length === 0) return rows;
    rows.push(...data);
  }
}
