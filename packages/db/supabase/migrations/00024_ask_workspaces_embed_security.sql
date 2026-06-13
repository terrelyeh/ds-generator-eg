-- ① widget origin allow-list (empty = unrestricted, current behaviour). The
--   embed page's CSP frame-ancestors is derived from this list.
-- ⑥ token_version: bump to revoke every outstanding workspace token at once
--   (the version is baked into the HMAC token and checked on each request).
alter table public.ask_workspaces
  add column if not exists allowed_origins text[] not null default '{}',
  add column if not exists token_version integer not null default 1;
