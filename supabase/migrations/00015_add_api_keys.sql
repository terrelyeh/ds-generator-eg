-- External API access for other departments' apps (RAG Search API).
-- Each key carries a server-enforced scope + fixed-window rate limit.
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,                         -- department / app name
  key_prefix text not null,                   -- e.g. "sk_live_ab12cd" for display + lookup hint
  key_hash text not null unique,              -- sha256 hex of the full key (plaintext never stored)
  scope jsonb not null default '{}'::jsonb,   -- { solution, product_lines[], models[], source_types[] }
  rate_limit_per_min int not null default 60,
  enabled boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  request_count bigint not null default 0,
  window_start timestamptz,
  window_count int not null default 0,
  note text
);

create index if not exists api_keys_key_hash_idx on public.api_keys (key_hash);

alter table public.api_keys enable row level security;
-- No public policies: all access is via the service role (admin client) behind
-- RBAC-gated API routes. RLS-on with zero policies = deny by default to anon/auth.

-- Atomic verify + fixed-window rate limit + usage bump in one round trip.
-- Returns the key row plus `allowed` (false when disabled or over the limit).
-- No rows returned => key not found (caller treats as 401).
create or replace function public.api_key_touch(p_hash text, p_now timestamptz default now())
returns table (
  id uuid,
  name text,
  scope jsonb,
  enabled boolean,
  rate_limit_per_min int,
  allowed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  k public.api_keys%rowtype;
  new_count int;
begin
  select * into k from public.api_keys where key_hash = p_hash;
  if not found then
    return;
  end if;

  if not k.enabled then
    return query select k.id, k.name, k.scope, k.enabled, k.rate_limit_per_min, false;
    return;
  end if;

  if k.window_start is null or p_now - k.window_start > interval '60 seconds' then
    update public.api_keys
      set window_start = p_now, window_count = 1,
          last_used_at = p_now, request_count = request_count + 1
      where api_keys.id = k.id;
    new_count := 1;
  else
    update public.api_keys
      set window_count = window_count + 1,
          last_used_at = p_now, request_count = request_count + 1
      where api_keys.id = k.id
      returning window_count into new_count;
  end if;

  return query select k.id, k.name, k.scope, k.enabled, k.rate_limit_per_min,
    (new_count <= k.rate_limit_per_min);
end;
$$;
