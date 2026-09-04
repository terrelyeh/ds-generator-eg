-- Heartbeats for the scheduled jobs.
--
-- Every signal we had for "did the nightly work happen" was a SIDE EFFECT,
-- and every one of them is silent when there was nothing to do:
--
--   product_lines.last_synced_at  only stamped for lines that actually
--                                 synced; Smart Sync skips an unchanged
--                                 sheet without touching it
--   documents.updated_at          only written when content_hash changed
--
-- So "the sheet had no edits" and "the cron never ran" look identical, and
-- that is exactly how the daily sync managed to 504 for several days, and
-- then answer 405 for another, with nobody noticing. This table records the
-- one thing a side effect cannot: the job reached its end.
--
-- One row per job, overwritten each run. History lives in Vercel's logs;
-- what a monitor needs is the latest.
create table if not exists public.job_heartbeats (
  job         text primary key,
  -- When the job last finished. Not when it started: a run that hangs must
  -- not look like a run that succeeded.
  last_run_at timestamptz not null default now(),
  -- Did it finish cleanly? A job that ran and failed is a different alert
  -- from a job that did not run.
  ok          boolean not null default true,
  -- One line for a human: counts, or the first error.
  detail      text,
  updated_at  timestamptz not null default now()
);

comment on table public.job_heartbeats is
  'Latest completion of each scheduled job. Written by the jobs, read by /api/cron/health.';

alter table public.job_heartbeats enable row level security;
-- No policies: service_role bypasses RLS, everyone else gets nothing. The
-- jobs and the health check both run server-side with the service key.
revoke all on table public.job_heartbeats from anon, authenticated;
grant all on table public.job_heartbeats to service_role;
