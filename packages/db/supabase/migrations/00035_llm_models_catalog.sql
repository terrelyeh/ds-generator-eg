-- Selectable LLM models, editable from the admin UI instead of two
-- hardcoded lists in two apps.
--
-- The OpenRouter slug IS the identifier. The old per-app ids were stable
-- keys whose display names drifted from what they actually called —
-- `gpt-4o` invoked gpt-5.5, `gemini-2.5-pro` invoked gemini-3.1-pro — so
-- a value stored anywhere told you nothing about the model used. Keying
-- on the slug removes that whole class of confusion: what's stored is
-- what's called.

create table if not exists public.llm_models (
  id           uuid primary key default gen_random_uuid(),
  -- e.g. "anthropic/claude-sonnet-4.6". Verify with
  -- apps/spechub/scripts/list-openrouter-models.ts before adding.
  slug         text not null unique,
  label        text not null,
  -- Which pickers offer it: 'translate' (SpecHub) and/or 'ask' (EnGenie).
  -- Not a check constraint — a new surface shouldn't need a migration.
  surfaces     text[] not null default '{}',
  -- Surfaces this model is the default for. Kept as an array so one model
  -- can default for both; the API clears the surface from other rows so
  -- only one can ever hold it.
  default_for  text[] not null default '{}',
  -- "none" is how a flash model's reasoning gets switched off — it thinks
  -- before the first streamed token and the thoughts are discarded, so
  -- leaving it on costs 7-15s of dead wait (pitfall #61). NULL = leave the
  -- model's own default alone, which is deliberate for Pro-tier models.
  reasoning_effort text check (reasoning_effort in ('none','minimal','low','medium','high')),
  enabled      boolean not null default true,
  sort_order   integer not null default 100,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.llm_models is
  'Models offered in the translate / Ask pickers. Slug is the OpenRouter model id and the identifier.';

create index if not exists llm_models_enabled_sort_idx
  on public.llm_models (enabled, sort_order);

alter table public.llm_models enable row level security;

-- Seed from the two hardcoded lists so day one behaviour is identical.
-- Union by slug: the four translate models were already a subset of Ask's
-- nine once both spoke OpenRouter.
insert into public.llm_models (slug, label, surfaces, default_for, reasoning_effort, sort_order) values
  ('anthropic/claude-sonnet-4.6',   'Claude Sonnet 4.6',   '{translate,ask}', '{translate}', null,   10),
  ('anthropic/claude-opus-4.8',     'Claude Opus 4.8',     '{translate,ask}', '{}',          null,   20),
  ('anthropic/claude-haiku-4.5',    'Claude Haiku 4.5',    '{ask}',           '{}',          null,   30),
  ('openai/gpt-5.5',                'GPT-5.5',             '{translate,ask}', '{}',          null,   40),
  ('openai/gpt-5.4-mini',           'GPT-5.4 Mini',        '{ask}',           '{}',          null,   50),
  ('openai/gpt-5.4-nano',           'GPT-5.4 Nano',        '{ask}',           '{}',          null,   60),
  ('google/gemini-3.1-pro-preview', 'Gemini 3.1 Pro',      '{translate,ask}', '{}',          null,   70),
  ('google/gemini-3.5-flash',       'Gemini 3.5 Flash',    '{ask}',           '{ask}',       'none', 80),
  ('google/gemini-3.1-flash-lite',  'Gemini 3.1 Flash Lite','{ask}',          '{}',          'none', 90)
on conflict (slug) do nothing;

-- Workspaces stored the old Ask id; move them onto slugs so the column
-- means the same thing the catalog does. All five currently hold
-- 'gemini-3.5-flash'.
--
-- An explicit map, not a prefix rule: the old ids were not slugs with the
-- vendor stripped. "claude-sonnet" is anthropic/claude-sonnet-4.6 and
-- "gemini-3.1-pro" is google/gemini-3.1-pro-preview, so prefixing would
-- have produced model names that don't exist.
update public.ask_workspaces w
set provider = m.slug
from (values
  ('claude-opus',           'anthropic/claude-opus-4.8'),
  ('claude-sonnet',         'anthropic/claude-sonnet-4.6'),
  ('claude-haiku',          'anthropic/claude-haiku-4.5'),
  ('gpt-5.5',               'openai/gpt-5.5'),
  ('gpt-5.4-mini',          'openai/gpt-5.4-mini'),
  ('gpt-5.4-nano',          'openai/gpt-5.4-nano'),
  ('gemini-3.1-pro',        'google/gemini-3.1-pro-preview'),
  ('gemini-3.5-flash',      'google/gemini-3.5-flash'),
  ('gemini-3.1-flash-lite', 'google/gemini-3.1-flash-lite')
) as m(old_id, slug)
where w.provider = m.old_id;
