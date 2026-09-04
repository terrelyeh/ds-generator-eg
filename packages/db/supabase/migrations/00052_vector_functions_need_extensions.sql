-- Put `extensions` back on the search_path of the two functions that use
-- pgvector's operators.
--
-- 00048 pinned every function the Supabase linter flagged to
-- `search_path = public`. For these two that is not merely tighter, it is
-- wrong: `<=>` is pgvector's distance operator and pgvector lives in the
-- `extensions` schema, so pinning the path to `public` alone removed the
-- operator the whole query is built on. Every call raised
--
--   operator does not exist: extensions.vector <=> extensions.vector
--
-- which means Ask retrieval — and therefore every Ask answer — was failing
-- from the moment 00048 reached production.
--
-- It produced no alarm anywhere. The route caught it and reported it as text,
-- and the way to notice was that `llm_usage_events` stopped gaining rows,
-- which is the health check this codebase already knew to use (pitfall #68).
-- It was found by running the function by hand while building 00051, not by
-- anything watching. Nobody happened to use Ask in the window, so it cost
-- nothing this time.
--
-- A fixed search_path is still right. It just has to include the schema the
-- function actually depends on — and "tightening" a setting is a change like
-- any other, so it needs the same question asked of it: what did this
-- depend on that I just took away?

alter function public.match_documents(vector, integer, double precision, text, jsonb)
  set search_path = public, extensions;

alter function public.match_documents_scoped(vector, integer, double precision, text, jsonb, text[], text[])
  set search_path = public, extensions;
