-- 官網 Datasheet 1b: which SpecHub language versions belong on the regional
-- sites, and what each site's production looked like at the daily check.
--
-- website_marks — one row per product and language: the current decision.
--   decision 'ready' = this version may go on the sites, so reminders track it.
--   decision 'skip'  = this version is not for the sites (不上架); it stops
--                      appearing in the "latest version, never marked" list.
--   The row names the version it was made for. A newer version is unmarked
--   until someone marks it, while an older 'ready' mark keeps being tracked.
--   generated_at is the PDF generation the mark was made against, so a later
--   Regenerate of the same version shows as "標記後重產過" (the mark stays:
--   the sites then hold an old file and the daily check says so).
--
-- website_site_state — one row per site, rewritten by the daily check.
--   production_modified / staging_modified: newest file or product page on each
--   side. Production is overwritten with staging by hand, so production only
--   moves when someone pushes — that move is how a push is detected.
--   last_push_at: when a push was last seen. push_detected is false while it is
--   only the lower bound from the first check (production's newest content).
--   pending: staging datasheets newer than production's newest content — what
--   the next push will publish.
--
-- Both are written and read only through the website_check routes and the
-- daily cron with the service role.

create table if not exists public.website_marks (
  product_id   uuid not null references public.products(id) on delete cascade,
  locale       text not null check (locale in ('en', 'ja', 'zh-TW')),
  decision     text not null check (decision in ('ready', 'skip')),
  version      text not null check (length(version) between 1 and 20),
  generated_at timestamptz,
  marked_by    uuid,
  marked_at    timestamptz not null default now(),
  primary key (product_id, locale)
);

alter table public.website_marks enable row level security;
revoke all on public.website_marks from anon, authenticated;

create table if not exists public.website_site_state (
  site                text primary key check (site in ('EU', 'JP', 'TW', 'APAC', 'IN')),
  checked_at          timestamptz not null default now(),
  production_modified timestamptz,
  staging_modified    timestamptz,
  last_push_at        timestamptz,
  push_detected       boolean not null default false,
  pending             jsonb not null default '[]'::jsonb
);

alter table public.website_site_state enable row level security;
revoke all on public.website_site_state from anon, authenticated;
