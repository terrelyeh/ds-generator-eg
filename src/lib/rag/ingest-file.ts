/**
 * Uploaded File ingestion — PDF / Word (.docx). Text extraction happens in the
 * upload route (unpdf / mammoth); this takes the already-extracted text and
 * runs the standard chunk → embed → upsert (source_type "file"). The original
 * file lives in the private `knowledge-files` Storage bucket; its path is kept
 * in metadata.storage_path for the "view original" signed-URL link.
 *
 * Re-uploading the same source_id is a clean replace (old chunks deleted first).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbeddings, contentHash, estimateTokens } from "./embeddings";
import { chunkText } from "./chunk";
import { normalizeTaxonomy, type TaxonomyMeta } from "./taxonomy";

const EMBED_BATCH_SIZE = 20;
const MAX_EMBED_CHARS = 21000;

export interface IngestFileOptions {
  sourceId: string;
  fileName: string;
  fileType: string; // "pdf" | "docx"
  fileSize: number;
  storagePath: string | null;
  text: string;
  label?: string;
  taxonomy?: Partial<TaxonomyMeta>;
}

export interface IngestFileResult {
  processed: number;
  chunks: number;
}

export async function ingestFile(opts: IngestFileOptions): Promise<IngestFileResult> {
  const { sourceId, fileName, fileType, fileSize, storagePath, text, label } = opts;
  const tax = normalizeTaxonomy(opts.taxonomy);
  const supabase = createAdminClient();
  const displayTitle = label?.trim() || fileName;

  await supabase
    .from("documents" as "products")
    .delete()
    .eq("source_type", "file")
    .eq("source_id", sourceId);

  const chunks = chunkText(text, displayTitle, label);
  if (chunks.length === 0) throw new Error("No text extracted from file");

  const baseMeta = {
    file_name: fileName,
    file_type: fileType,
    file_size: fileSize,
    file_label: label || null,
    storage_path: storagePath,
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
      const { error } = await supabase.from("documents" as "products").upsert(
        {
          source_type: "file",
          source_id: sourceId,
          source_url: null,
          title: chunk.title,
          chunk_index: idx,
          content: chunk.content,
          token_count: estimateTokens(chunk.content),
          metadata: baseMeta,
          embedding: `[${embeddings[j].join(",")}]`,
          content_hash: contentHash(chunk.content),
          updated_at: new Date().toISOString(),
        } as Record<string, unknown>,
        { onConflict: "source_type,source_id,chunk_index" },
      );
      if (error) throw new Error(`File upsert failed: ${JSON.stringify(error)}`);
      processed++;
    }
  }

  return { processed, chunks: chunks.length };
}
