/**
 * Support knowledge (Intercom conversations) → RAG.
 *
 * Indexes refined `support` articles — produced offline by the refinery in
 * `/dev/RAG` (clustered, PII-scrubbed, taxonomy-tagged) — into the `documents`
 * store under source_type `support`, scoped to the internal-only `support`
 * knowledge area. Thin wrapper over the shared ingest-refined core; the future
 * Mantis bug-tracker pipeline is a sibling wrapper binding its own source_type +
 * knowledge area.
 */
import { ingestRefinedArticles, type RefinedArticleInput } from "./ingest-refined";

/** documents.source_type for Intercom-derived support knowledge. */
export const SUPPORT_SOURCE_TYPE = "support";
/** kind='knowledge' solution slug → internal-only (excluded from /api/v1/search). */
export const SUPPORT_KNOWLEDGE_AREA = "support";

export function ingestSupport(opts: { articles: RefinedArticleInput[]; dryRun?: boolean }) {
  return ingestRefinedArticles({
    sourceType: SUPPORT_SOURCE_TYPE,
    knowledgeArea: SUPPORT_KNOWLEDGE_AREA,
    articles: opts.articles,
    dryRun: opts.dryRun,
  });
}
