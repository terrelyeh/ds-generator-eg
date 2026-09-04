-- Filter a workspace's scope in SQL, not after the fact.
--
-- `match_documents` returns the N nearest chunks and nothing else, so
-- `retrieve.ts` asked for 40 and then threw away everything outside the
-- caller's scope in JavaScript. For a broad caller that is fine. For a narrow
-- one it is not: a workspace scoped to a single knowledge area competes for
-- those 40 slots against the entire product corpus, so a question whose 40
-- nearest chunks happen to be datasheets filters down to zero and answers
-- "I couldn't find relevant product information" — while the area it is
-- scoped to holds a perfectly good answer. Nothing about that failure looks
-- like a bug; it looks like the knowledge base being thin.
--
-- The fix is to let the index do the filtering. Excluded areas never enter
-- the candidate pool, so the 40 slots are 40 chunks the caller may actually
-- read.
--
-- ── Why a new name ────────────────────────────────────────────────────────
-- Adding parameters changes the signature. Replacing the old function in
-- place would break retrieval for the minute or two that the previous
-- deployment is still serving, and creating an overload makes the call
-- ambiguous to PostgREST ("function is not unique") because every new
-- parameter has a default. A second name costs one follow-up migration to
-- drop `match_documents` once nothing calls it, and costs no downtime.
--
-- The JavaScript scope filter in `retrieve.ts` stays where it is. This makes
-- the candidate pool honest; that still decides what comes back.

create or replace function public.match_documents_scoped(
  query_embedding vector,
  match_count integer default 10,
  match_threshold double precision default 0.5,
  filter_source_type text default null,
  filter_metadata jsonb default null,
  -- Knowledge-area slugs this caller may NOT read. Null = no exclusions.
  exclude_solutions text[] default null,
  -- Restrict to these source types. Null = every type.
  filter_source_types text[] default null
)
returns table (
  id uuid,
  source_type text,
  source_id text,
  source_url text,
  title text,
  chunk_index integer,
  content text,
  metadata jsonb,
  similarity double precision
)
language plpgsql
set search_path to 'public'
as $$
begin
  return query
  select
    d.id,
    d.source_type,
    d.source_id,
    d.source_url,
    d.title,
    d.chunk_index,
    d.content,
    d.metadata,
    (1 - (d.embedding <=> query_embedding))::float as similarity
  from public.documents d
  where
    d.embedding is not null
    and 1 - (d.embedding <=> query_embedding) > match_threshold
    and (filter_source_type is null or d.source_type = filter_source_type)
    and (filter_source_types is null or d.source_type = any(filter_source_types))
    and (filter_metadata is null or d.metadata @> filter_metadata)
    and (
      exclude_solutions is null
      -- A chunk with no solution is global content and stays in.
      or coalesce(d.metadata->>'solution', '') <> all(exclude_solutions)
    )
  order by d.embedding <=> query_embedding
  limit match_count;
end;
$$;

revoke all on function public.match_documents_scoped(vector, integer, double precision, text, jsonb, text[], text[]) from public, anon, authenticated;
grant execute on function public.match_documents_scoped(vector, integer, double precision, text, jsonb, text[], text[]) to service_role;
