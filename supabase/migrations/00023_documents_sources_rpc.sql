-- Aggregate the documents index in one round-trip instead of streaming every
-- chunk row to the app and grouping in JS (the old path was O(sources × chunks)
-- and transferred up to 50k heavy rows incl. unused content_hash + metadata).
-- Returns one row per logical source: chunk count, token total, latest update,
-- and a representative title + metadata taken from the lowest chunk_index.
create or replace function public.knowledge_sources(p_source_type text default null)
returns table (
  source_type text,
  source_id text,
  title text,
  chunks bigint,
  total_tokens bigint,
  last_updated timestamptz,
  metadata jsonb
)
language sql
stable
as $$
  with agg as (
    select
      d.source_type,
      d.source_id,
      count(*)::bigint as chunks,
      coalesce(sum(d.token_count), 0)::bigint as total_tokens,
      max(d.updated_at) as last_updated
    from public.documents d
    where p_source_type is null or d.source_type = p_source_type
    group by d.source_type, d.source_id
  ),
  rep as (
    select distinct on (d.source_type, d.source_id)
      d.source_type, d.source_id, d.title, d.metadata
    from public.documents d
    where p_source_type is null or d.source_type = p_source_type
    order by d.source_type, d.source_id, d.chunk_index asc
  )
  select
    a.source_type,
    a.source_id,
    r.title,
    a.chunks,
    a.total_tokens,
    a.last_updated,
    r.metadata
  from agg a
  join rep r on r.source_type = a.source_type and r.source_id = a.source_id
$$;
