-- Replace the ivfflat(lists=10) vector index with HNSW.
--
-- The original ivfflat index with lists=10 and the default probes=1 scanned only
-- ~1/10 of the vectors per query, so relevant chunks were silently dropped before
-- the taxonomy filter / re-rank / cross-lingual supplements ever ran — the single
-- biggest hidden hit to retrieval quality. HNSW (pgvector 0.8) gives far better
-- recall/latency with no lists/probes tuning and degrades gracefully as the
-- corpus grows. Build is fast at this size (~4k chunks).
--
-- match_documents already orders by `embedding <=> query` and applies match_count,
-- so no function change is needed; the index just changes how candidates are found.
drop index if exists public.documents_embedding_idx;
create index documents_embedding_idx
  on public.documents
  using hnsw (embedding vector_cosine_ops);
