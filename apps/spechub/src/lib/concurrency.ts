/**
 * Run `fn` over `items` with at most `limit` calls in flight at once.
 *
 * Results come back in INPUT order as settled results, one per item, so a
 * rejection is a value the caller looks at rather than an exception that
 * takes the rest of the batch with it.
 *
 * `Promise.all(items.map(fn))` is the shape this replaces. It starts
 * everything at once, which for a sync run would mean every product's Drive
 * downloads and sharp trims held in memory together; a plain `for…await` is
 * the other extreme, and is what made a 27-product line take minutes of
 * mostly waiting on the network.
 */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`mapConcurrent: limit must be a positive integer, got ${limit}`);
  }
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;

  // Each worker pulls the next index until none are left, so `limit`
  // workers means at most `limit` calls in flight. One shared counter rather
  // than pre-sliced lanes: a slow item then delays one slot, not a fifth of
  // the batch.
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
