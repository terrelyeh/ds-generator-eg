-- Codify RLS state that was enabled directly on prod (2026-06-19) but never
-- recorded in a migration — without this file, a rebuilt/branch DB would come
-- up WITHOUT row security on these six tables. Matches prod exactly as of
-- 2026-07-05 (verified via pg_tables/pg_policies); idempotent on re-apply.
--
-- documents & chat_sessions deliberately get NO policies: all app access goes
-- through the service-role client behind app-layer RBAC, so anon/authenticated
-- direct access is deny-all. RLS here is the defence-in-depth backstop.

alter table public.documents enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.solutions enable row level security;
alter table public.comparisons enable row level security;
alter table public.cloud_comparisons enable row level security;
alter table public.revision_logs enable row level security;

-- solutions: read-only for everyone (product taxonomy is public within the app)
drop policy if exists "Allow public read access" on public.solutions;
create policy "Allow public read access" on public.solutions
  for select using (true);

-- comparisons / cloud_comparisons / revision_logs: public read, auth write
drop policy if exists "Public read comparisons" on public.comparisons;
create policy "Public read comparisons" on public.comparisons
  for select using (true);
drop policy if exists "Auth insert comparisons" on public.comparisons;
create policy "Auth insert comparisons" on public.comparisons
  for insert to authenticated with check (true);
drop policy if exists "Auth update comparisons" on public.comparisons;
create policy "Auth update comparisons" on public.comparisons
  for update to authenticated using (true);

drop policy if exists "Public read cloud_comparisons" on public.cloud_comparisons;
create policy "Public read cloud_comparisons" on public.cloud_comparisons
  for select using (true);
drop policy if exists "Auth insert cloud_comparisons" on public.cloud_comparisons;
create policy "Auth insert cloud_comparisons" on public.cloud_comparisons
  for insert to authenticated with check (true);
drop policy if exists "Auth update cloud_comparisons" on public.cloud_comparisons;
create policy "Auth update cloud_comparisons" on public.cloud_comparisons
  for update to authenticated using (true);

drop policy if exists "Public read revision_logs" on public.revision_logs;
create policy "Public read revision_logs" on public.revision_logs
  for select using (true);
drop policy if exists "Auth insert revision_logs" on public.revision_logs;
create policy "Auth insert revision_logs" on public.revision_logs
  for insert to authenticated with check (true);
drop policy if exists "Auth update revision_logs" on public.revision_logs;
create policy "Auth update revision_logs" on public.revision_logs
  for update to authenticated using (true);
