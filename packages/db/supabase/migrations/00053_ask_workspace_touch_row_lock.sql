-- ask_workspace_touch: serialise concurrent touches on one workspace.
--
-- The counter read the row, decided, then wrote — with nothing holding the
-- row in between. Two requests arriving together both read window_count = 9,
-- both computed 10, both passed a limit of 10, and both wrote 10: the quota
-- under-counted by exactly the number of concurrent callers, which is the
-- moment a quota is for. A widget embedded on a busy page fires exactly that
-- pattern.
--
-- `select … for update` makes the second caller wait for the first's write
-- and then read the updated count. Body otherwise identical to 00017; the
-- grants from 00048 (service_role only) are restated so a reader of this file
-- does not have to trust CREATE OR REPLACE to keep them (it does).
create or replace function public.ask_workspace_touch(p_slug text, p_now timestamptz default now())
returns table (id uuid, allowed boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.ask_workspaces%rowtype;
  new_min int;
  new_day int;
  today text := to_char(p_now, 'YYYY-MM-DD');
begin
  select * into w from public.ask_workspaces where slug = p_slug for update;
  if not found then return; end if;
  if not w.enabled then return query select w.id, false, 'disabled'; return; end if;

  if w.window_start is null or p_now - w.window_start > interval '60 seconds' then new_min := 1;
  else new_min := w.window_count + 1; end if;
  if w.day_key is distinct from today then new_day := 1; else new_day := w.day_count + 1; end if;

  if new_min > w.rate_limit_per_min then return query select w.id, false, 'rate_limit'; return; end if;
  if w.daily_limit is not null and new_day > w.daily_limit then return query select w.id, false, 'daily_limit'; return; end if;

  update public.ask_workspaces set
    window_start = case when w.window_start is null or p_now - w.window_start > interval '60 seconds' then p_now else w.window_start end,
    window_count = new_min, day_key = today, day_count = new_day,
    request_count = request_count + 1, last_used_at = p_now
  where ask_workspaces.id = w.id;

  return query select w.id, true, null::text;
end;
$$;

revoke all on function public.ask_workspace_touch(text, timestamptz) from public, anon, authenticated;
grant execute on function public.ask_workspace_touch(text, timestamptz) to service_role;
