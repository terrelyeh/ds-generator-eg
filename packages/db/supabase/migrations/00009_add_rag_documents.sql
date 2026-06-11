-- Enable pgvector extension
create extension if not exists vector with schema extensions;

-- =============================================
-- documents: Universal document store for RAG
-- Supports: product_spec, gitbook, web, google_doc, file (Word/PDF), text_snippet
-- =============================================
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),

  -- Source identification
  source_type text not null,                -- 'product_spec' | 'gitbook' | 'web' | 'google_doc' | 'file' | 'text_snippet'
  source_id text not null,                  -- product model_name, Gitbook page slug, Google Doc ID, URL, etc.
  source_url text,                          -- Original URL for citation in answers

  -- Content
  title text not null,                      -- Document/chunk title for display
  chunk_index int not null default 0,       -- 0-based index for multi-chunk documents
  content text not null,                    -- Plain text content of this chunk
  token_count int,                          -- Approximate token count for this chunk

  -- Flexible metadata (product_line, locale, tags, file_type, etc.)
  metadata jsonb not null default '{}',

  -- Vector embedding (OpenAI text-embedding-3-small = 1536 dimensions)
  embedding vector(1536),

  -- Timestamps
  content_hash text,                        -- SHA-256 of content, skip re-embed if unchanged
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for vector similarity search (cosine distance)
create index if not exists documents_embedding_idx
  on public.documents
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 10);

-- Index for filtering by source_type
create index if not exists documents_source_type_idx
  on public.documents (source_type);

-- Index for finding chunks of a specific source
create index if not exists documents_source_id_idx
  on public.documents (source_type, source_id);

-- Unique constraint: one chunk per source+index (prevents duplicates on re-embed)
create unique index if not exists documents_source_chunk_unique
  on public.documents (source_type, source_id, chunk_index);

-- =============================================
-- Function: match_documents
-- Performs vector similarity search with optional filters
-- =============================================
create or replace function public.match_documents(
  query_embedding vector(1536),
  match_count int default 10,
  match_threshold float default 0.5,
  filter_source_type text default null,
  filter_metadata jsonb default null
)
returns table (
  id uuid,
  source_type text,
  source_id text,
  source_url text,
  title text,
  chunk_index int,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
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
    1 - (d.embedding <=> query_embedding) as similarity
  from public.documents d
  where
    d.embedding is not null
    and 1 - (d.embedding <=> query_embedding) > match_threshold
    and (filter_source_type is null or d.source_type = filter_source_type)
    and (filter_metadata is null or d.metadata @> filter_metadata)
  order by d.embedding <=> query_embedding
  limit match_count;
end;
$$;
