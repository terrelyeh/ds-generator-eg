/**
 * Text Snippet ingestion — manual knowledge entries (FAQ, competitive notes,
 * standard answers). Flow: title + markdown body → chunk → embed → upsert
 * (source_type "text_snippet"). The raw markdown is stored on chunk 0's
 * metadata (`raw`) so the editor can reload it for editing.
 *
 * Edits replace in place: chunks are written over their previous versions and
 * any leftover tail is trimmed AFTERWARDS, so a failed embed cannot leave the
 * snippet deleted (see the note on deleteStaleChunks).
 */

import { createAdminClient } from "@eg/db/admin";
import { generateEmbeddings, contentHash, estimateTokens } from "./embeddings";
import { chunkText } from "./chunk";
import { normalizeTaxonomy, type TaxonomyMeta } from "./taxonomy";
import { trimStaleChunks } from "./replace-chunks";

const EMBED_BATCH_SIZE = 20;
const MAX_EMBED_CHARS = 21000;

export interface IngestTextSnippetOptions {
  /** Stable id: caller generates a slug for new snippets, reuses it for edits. */
  sourceId: string;
  title: string;
  content: string;
  label?: string;
  taxonomy?: Partial<TaxonomyMeta>;
}

export interface IngestTextSnippetResult {
  processed: number;
  chunks: number;
}

export async function ingestTextSnippet(opts: IngestTextSnippetOptions): Promise<IngestTextSnippetResult> {
  const { sourceId, title, content, label } = opts;
  const tax = normalizeTaxonomy(opts.taxonomy);
  const supabase = createAdminClient();

  const chunks = chunkText(content, title, label);
  if (chunks.length === 0) {
    throw new Error("Snippet content is empty");
  }

  const baseMeta = {
    snippet_label: label || null,
    solution: tax.solution,
    product_lines: tax.product_lines,
    models: tax.models,
  };

  let processed = 0;
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const texts = batch.map((c) => (c.content.length > MAX_EMBED_CHARS ? c.content.slice(0, MAX_EMBED_CHARS) : c.content));
    const embeddings = await generateEmbeddings(texts);

    for (let j = 0; j < batch.length; j++) {
      const idx = i + j;
      const chunk = batch[j];
      // Keep the editable raw markdown + display title on chunk 0 only.
      const metadata = idx === 0 ? { ...baseMeta, raw: content, snippet_title: title } : baseMeta;
      const { error } = await supabase.from("documents" as "products").upsert(
        {
          source_type: "text_snippet",
          source_id: sourceId,
          source_url: null,
          title: chunk.title,
          chunk_index: idx,
          content: chunk.content,
          token_count: estimateTokens(chunk.content),
          metadata,
          embedding: `[${embeddings[j].join(",")}]`,
          content_hash: contentHash(chunk.content),
          updated_at: new Date().toISOString(),
        } as Record<string, unknown>,
        { onConflict: "source_type,source_id,chunk_index" },
      );
      if (error) throw new Error(`Snippet upsert failed: ${JSON.stringify(error)}`);
      processed++;
    }
  }

  await trimStaleChunks(supabase, "text_snippet", sourceId, chunks.length);

  return { processed, chunks: chunks.length };
}
