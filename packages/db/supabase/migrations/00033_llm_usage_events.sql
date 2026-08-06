-- Per-call LLM spend, recorded by us rather than read back from OpenRouter.
--
-- Why we keep our own ledger instead of asking OpenRouter to break spend
-- down per key (verified against openrouter.ai/openapi.json, 2026-08-06):
--   * GET /keys lists only keys created through the provisioning API —
--     keys created in the dashboard never appear, so the three keys this
--     account actually uses are invisible to it.
--   * GET /activity groups by date/model/endpoint; its group_by enum
--     accepts only "workspace". There is no group_by=api_key.
-- A per-key table built on those endpoints would have rendered a number
-- that looks authoritative and is wrong.
--
-- The chat completions response already carries `usage.cost`, so every
-- call can report exactly what it cost. Recording that ourselves gives
-- finer attribution than per-key ever would: by surface, by model, by
-- workspace, and down to which product's datasheet was expensive.
--
-- Volume: one row per LLM call. Translation is a handful per datasheet;
-- Ask is the one that could grow. Revisit retention (monthly rollup +
-- prune) if this passes a few hundred thousand rows.

create table if not exists public.llm_usage_events (
  id                uuid primary key default gen_random_uuid(),
  -- Which key paid: 'spechub' or 'ask'. Matches Surface in
  -- @eg/llm/openrouter — one value picks the key and tags the spend, so
  -- the two can't drift. Left as text rather than a check constraint so
  -- adding a third key later needs no migration.
  surface           text not null,
  -- OpenRouter slug actually billed, e.g. "anthropic/claude-sonnet-4.6".
  model             text not null,
  -- USD. Unconstrained numeric on purpose — single calls land in the
  -- 1e-6 range and a fixed scale would silently round them to zero.
  cost              numeric not null default 0,
  prompt_tokens     integer,
  completion_tokens integer,
  total_tokens      integer,
  -- True when a workspace/visitor supplied their own key. That spend is
  -- not ours and must be excluded from company totals.
  is_byok           boolean not null default false,
  -- Free-form attribution: model name, workspace slug, product model…
  ref               text,
  -- OpenRouter generation id, for looking a call up via GET /generation.
  generation_id     text,
  created_at        timestamptz not null default now()
);

comment on table public.llm_usage_events is
  'One row per LLM call with its OpenRouter-reported cost. Our own ledger — OpenRouter''s public API cannot break spend down per API key.';

-- The dashboard reads "recent spend" and "spend by surface"; both are
-- time-bounded, so lead with created_at.
create index if not exists llm_usage_events_created_idx
  on public.llm_usage_events (created_at desc);
create index if not exists llm_usage_events_surface_created_idx
  on public.llm_usage_events (surface, created_at desc);

-- Deny-all backstop, matching documents / chat_sessions: every read and
-- write goes through service-role behind an RBAC gate (billing.view).
alter table public.llm_usage_events enable row level security;

-- Aggregate server-side so the dashboard never pulls the raw ledger over
-- the wire. Returns one row per (surface, model) — a few dozen at most, so
-- both the by-surface and by-model views are derivable from one call.
--
-- BYOK spend is excluded: a workspace paying with its own key is not
-- company cost. Rows are still recorded for volume stats.
--
-- NOT security definer, and execute is revoked from anon/authenticated:
-- callers come through service-role behind the billing.view gate.
create or replace function public.llm_spend_summary(days integer default 30)
returns table (
  surface text,
  model   text,
  cost    numeric,
  calls   bigint,
  tokens  bigint
)
language sql
stable
set search_path = public
as $$
  select
    e.surface,
    e.model,
    sum(e.cost)                        as cost,
    count(*)                           as calls,
    coalesce(sum(e.total_tokens), 0)   as tokens
  from public.llm_usage_events e
  where e.created_at >= now() - make_interval(days => greatest(days, 1))
    and e.is_byok = false
  group by e.surface, e.model
  order by sum(e.cost) desc;
$$;

revoke all on function public.llm_spend_summary(integer) from public, anon, authenticated;
grant execute on function public.llm_spend_summary(integer) to service_role;
