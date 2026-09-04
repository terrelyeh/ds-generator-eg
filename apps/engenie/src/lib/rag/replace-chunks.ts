/**
 * Replace-after-write, not delete-then-write.
 *
 * Four ingest pipelines used to delete a source's chunks first and embed
 * afterwards. Between the two the source did not exist — and the step in
 * between is a network call to OpenAI that can rate-limit or fail. When it
 * did, the source was simply gone: for a text snippet that includes the raw
 * markdown kept on chunk 0, which is the only copy of what somebody typed,
 * and there is no undo for it. A PDF upload was worse still, because the
 * file had already been written to storage under a row that no longer
 * existed to point at it.
 *
 * Writing first and trimming afterwards means a failed embed leaves the
 * previous version exactly where it was. The upsert keys on
 * (source_type, source_id, chunk_index), so chunks 0..n-1 are overwritten in
 * place; only a source that got SHORTER leaves anything behind, and that is
 * what this removes.
 */

import type { createAdminClient } from "@eg/db/admin";
import { throwIfDbError, logIfDbError } from "@eg/db/errors";

/**
 * Drop chunks left over from a longer previous version of this source.
 *
 * Call it AFTER every chunk has been written, never before.
 */
export async function trimStaleChunks(
  supabase: ReturnType<typeof createAdminClient>,
  sourceType: string,
  sourceId: string,
  keptCount: number,
): Promise<void> {
  throwIfDbError(`documents stale-chunk trim (${sourceType})`)(
    await supabase
      .from("documents" as "products")
      .delete()
      .eq("source_type", sourceType)
      .eq("source_id", sourceId)
      .gte("chunk_index", keptCount),
  );
}

/**
 * Sources that existed before this run and were not produced by it.
 *
 * Pure so it can be tested: the decision of which sources have vanished is
 * set arithmetic; only the delete needs a database. `produced` must be every
 * source the run SAW — changed or not — never just the ones it re-embedded,
 * which is the mistake that once deleted live GitBook pages (#69 in that
 * file's history).
 */
export function vanishedSourceIds(existing: Iterable<string>, produced: Set<string>): string[] {
  const gone = new Set<string>();
  for (const id of existing) if (!produced.has(id)) gone.add(id);
  return [...gone];
}

/**
 * Remove every chunk of the sources that vanished, in batches.
 *
 * Callers decide the universe (`existing`) and whether the run is trusted
 * enough to delete at all — a run with a failed fetch must not, or one
 * transient timeout removes a page that is still live.
 */
export async function deleteVanishedSources(
  supabase: ReturnType<typeof createAdminClient>,
  sourceType: string,
  existing: Iterable<string>,
  produced: Set<string>,
): Promise<number> {
  const gone = vanishedSourceIds(existing, produced);
  for (let i = 0; i < gone.length; i += 100) {
    const batch = gone.slice(i, i + 100);
    logIfDbError(
      `${sourceType} vanished-source delete`,
      await supabase
        .from("documents" as "products")
        .delete()
        .eq("source_type", sourceType)
        .in("source_id", batch),
    );
  }
  if (gone.length > 0) console.info(`[${sourceType}] removed ${gone.length} source(s) no longer present: ${gone.slice(0, 5).join(", ")}${gone.length > 5 ? ", …" : ""}`);
  return gone.length;
}
