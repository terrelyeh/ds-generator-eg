-- Add a third LLM mode to Ask workspaces: 'user_byok'.
--   shared    — company key + quota (server-side)
--   byok      — admin sets ONE key for the workspace; all visitors share it
--   user_byok — each visitor enters their OWN key in the UI (kept in their
--               browser, sent per-request, never stored server-side)
-- Only widens the allowed values; no data change.
alter table public.ask_workspaces drop constraint if exists ask_workspaces_llm_mode_check;
alter table public.ask_workspaces
  add constraint ask_workspaces_llm_mode_check
  check (llm_mode in ('shared', 'byok', 'user_byok'));
