-- The last website datasheet check for a model on one regional site — what the
-- product page's 官網 tab shows before anyone presses 重新查詢.
--
-- One row per (model, site), not one per model: the tab checks the five sites
-- in parallel so each can report as it finishes, and a single row per model
-- would have five requests merging into the same JSON at once.
--
-- verdict is lib/website/compare.ts's SiteVerdict; baseline is the SpecHub
-- versions it was judged against, kept so the page can tell when SpecHub has
-- made a newer PDF since the check.
--
-- model_name is the upper-cased model number as the sites spell it, so a model
-- that isn't in SpecHub (a Fit AP) can be stored too. Written and read only by
-- the website_check.view routes through the service role.

create table if not exists public.website_checks (
  model_name  text not null check (model_name = upper(model_name) and length(model_name) between 1 and 64),
  site        text not null check (site in ('EU', 'JP', 'TW', 'APAC', 'IN')),
  checked_at  timestamptz not null default now(),
  checked_by  uuid,
  status      text not null,
  verdict     jsonb not null,
  baseline    jsonb,
  primary key (model_name, site)
);

alter table public.website_checks enable row level security;
revoke all on public.website_checks from anon, authenticated;
