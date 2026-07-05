-- Trigram indexes for the model-mention supplement queries in retrieve.ts.
--
-- Whenever a question names a model (the most common question shape), the
-- retrieval core adds literal-match supplements:
--   content ILIKE '%ECW230%' / title ILIKE '%ECW230%' / source_id ILIKE '%ecw230%'
-- Without trigram indexes each of those is a sequential scan over the whole
-- documents table — hundreds of ms per ask today, growing linearly with the
-- corpus. pg_trgm GIN indexes turn ILIKE '%…%' into an index scan (model
-- names are ≥5 chars, comfortably above the 3-char trigram minimum).
--
-- Idempotent on purpose: this may be applied directly to prod first, then
-- re-applied by `supabase db push` without erroring.
create extension if not exists pg_trgm with schema extensions;

create index if not exists documents_content_trgm_idx
  on public.documents using gin (content extensions.gin_trgm_ops);

create index if not exists documents_title_trgm_idx
  on public.documents using gin (title extensions.gin_trgm_ops);

create index if not exists documents_source_id_trgm_idx
  on public.documents using gin (source_id extensions.gin_trgm_ops);
