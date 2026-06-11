-- Multi-tenant "Ask" workspaces: each department gets its own entry (/ask/<slug>)
-- with its own passcode, LLM mode (shared key+quota OR BYOK), knowledge scope,
-- and persona/profile/welcome. Retrieval stays on our shared KB (scoped).
create table if not exists public.ask_workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  enabled boolean not null default true,
  passcode_hash text,
  llm_mode text not null default 'shared' check (llm_mode in ('shared', 'byok')),
  provider text not null default 'gemini-3.5-flash',
  byok_provider text,
  byok_key_encrypted text,                   -- AES-256-GCM (API_KEY_ENC_SECRET)
  scope jsonb not null default '{}'::jsonb,  -- { solution, product_lines[], models[], source_types[] }
  persona text not null default 'default',
  profile text not null default 'default',
  allow_switch boolean not null default true,
  welcome_subtitle text,
  welcome_description text,
  example_questions jsonb,
  rate_limit_per_min int not null default 30,
  daily_limit int,
  request_count bigint not null default 0,
  window_start timestamptz,
  window_count int not null default 0,
  day_key text,
  day_count int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  note text
);

create index if not exists ask_workspaces_slug_idx on public.ask_workspaces (slug);
alter table public.ask_workspaces enable row level security;

-- Atomic per-request gate: bump usage, enforce per-minute + daily limits.
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
  select * into w from public.ask_workspaces where slug = p_slug;
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
