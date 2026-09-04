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
import { throwIfDbError } from "@eg/db/errors";

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
