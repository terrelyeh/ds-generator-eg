-- Line-level shared datasheet content, usable by BOTH per-model and series
-- datasheets. First consumer: Broadband Outdoor ▸ Broadband EOC, whose
-- reference PDF is a 14-page series document where pages 1–2 (cover
-- marketing blocks + Features & Benefits + deployment diagram) are entirely
-- line-level, and pages 3+ are per-model slices of the same material.
--
-- `line_datasheets` (migration 00029) already held series content; this
-- widens it into the shared-content container:
--   benefits  — the "Features & Benefits" list ([{text}] or plain strings)
--   footnote  — e.g. "*Note: Partial functions are available only in
--               specific models." printed under both lists
--
-- `ds_scope` gains 'both': the line ships per-model datasheets AND a series
-- one, sharing this content. Existing values keep their meaning —
-- 'model' (default) = per-model only, 'series' = series only.

alter table public.line_datasheets
  add column if not exists benefits jsonb not null default '[]'::jsonb,
  add column if not exists footnote text;

alter table public.product_lines
  drop constraint if exists product_lines_ds_scope_check;
alter table public.product_lines
  add constraint product_lines_ds_scope_check
  check (ds_scope in ('model', 'series', 'both'));
