-- Brute-force protection for the passcode entry points (/api/ws-auth and
-- /api/demo-auth). Both previously accepted unlimited guesses; workspace
-- passcodes are unsalted sha256 so short passcodes were online-bruteforceable.
--
-- Fixed-window counter per key ("<surface>:<slug>:<ip>" / "demo:<ip>"),
-- checked atomically BEFORE the passcode is verified — which also removes any
-- timing oracle between "unknown workspace" and "wrong passcode".
--
-- The table is service-role-only (RLS on, no policies). Rows are tiny and
-- keyed per IP; stale rows are harmless (any new attempt resets an expired
-- window in place).

create table if not exists public.auth_rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  attempts int not null default 0
);

alter table public.auth_rate_limits enable row level security;

create or replace function public.auth_rate_check(
  p_key text,
  p_max_attempts int default 10,
  p_window_seconds int default 300
) returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_allowed boolean;
begin
  insert into public.auth_rate_limits as r (key, window_start, attempts)
  values (p_key, now(), 1)
  on conflict (key) do update set
    attempts = case
      when now() - r.window_start > make_interval(secs => p_window_seconds)
      then 1 else r.attempts + 1 end,
    window_start = case
      when now() - r.window_start > make_interval(secs => p_window_seconds)
      then now() else r.window_start end
  returning r.attempts <= p_max_attempts into v_allowed;
  return v_allowed;
end;
$$;
