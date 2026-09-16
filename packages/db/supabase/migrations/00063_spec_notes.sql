-- Spec footnotes, maintained in the master sheet.
--
-- The "*Note: …" line under a datasheet's spec table has existed since
-- 2026-05-13, but only per product LINE and only settable by hand-written SQL,
-- so PMs could not touch it and exactly one line ever had one. PMs now write
-- them per model in the Web Overview tab's "Spec Footnote" row — one note per
-- line, each carrying the marker (*, **) that matches the marker they typed
-- into the spec value itself.
--
-- NULL means "this model says nothing", and the datasheet falls back to the
-- product line's footnote; it does not mean "no footnote".

alter table public.products
  add column if not exists spec_notes text;

comment on column public.products.spec_notes is
  'Spec footnotes from the sheet''s "Spec Footnote" row: one note per line, marker included. NULL = fall back to product_lines.spec_footnote.';

alter table public.product_translations
  add column if not exists spec_notes text;

comment on column public.product_translations.spec_notes is
  'Locale copy of products.spec_notes, same one-per-line shape. NULL = print the English notes.';

-- These three are already in production: added by hand in 2026-05-13 (the
-- per-line footnote) and later (the QR template) without ever being written
-- as a migration, so a database built from this folder alone did not have
-- them — the renderer reads them through a runtime cast and would have seen
-- undefined, printing no footnote and the wrong QR URL, with nothing failing
-- loudly. Declared here so a fresh environment matches prod. Idempotent on
-- purpose: on prod these are no-ops.
alter table public.product_lines
  add column if not exists spec_footnote text,
  add column if not exists spec_footnote_translations jsonb default '{}'::jsonb,
  add column if not exists qr_url_template text;
