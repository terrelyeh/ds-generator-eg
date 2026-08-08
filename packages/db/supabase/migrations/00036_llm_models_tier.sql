-- Tier badge for the model picker ("Strongest" / "Mainstream" / "Best CP").
--
-- The chat UIs carried their own hardcoded model lists with these labels,
-- which is how they survived the slug migration untouched — and why every
-- selection silently fell back to the surface default: they were sending
-- the retired short ids, which resolve to nothing in a slug-keyed catalog.
--
-- Putting tier in the catalog lets those lists come from the DB without
-- losing the badge that tells a non-technical user which model to pick.
alter table public.llm_models
  add column if not exists tier text;

comment on column public.llm_models.tier is
  'Optional badge shown in the model picker, e.g. Strongest / Mainstream / Best CP. Free text — it is editorial, not behavioural.';

update public.llm_models set tier = v.tier
from (values
  ('anthropic/claude-opus-4.8',     'Strongest'),
  ('anthropic/claude-sonnet-4.6',   'Mainstream'),
  ('anthropic/claude-haiku-4.5',    'Best CP'),
  ('openai/gpt-5.5',                'Strongest'),
  ('openai/gpt-5.4-mini',           'Mainstream'),
  ('openai/gpt-5.4-nano',           'Best CP'),
  ('google/gemini-3.1-pro-preview', 'Strongest'),
  ('google/gemini-3.5-flash',       'Mainstream'),
  ('google/gemini-3.1-flash-lite',  'Best CP')
) as v(slug, tier)
where public.llm_models.slug = v.slug;
