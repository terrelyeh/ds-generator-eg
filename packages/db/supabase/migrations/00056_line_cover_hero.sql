-- A cover photograph that belongs to the LINE, not to a model.
--
-- Layout B (Data Center) and layout D (Edge AI Box) open on a full-bleed
-- scene rather than a colour field. That image is the same for every model
-- in the line — it is a data-centre, not a product shot — so it has no home
-- among the per-model image_assets rows.
--
-- WHY NOT line_datasheets.images.hero, which already holds exactly this for
-- Orin Box: sync REPLACES that whole jsonb whenever the line's Drive folder
-- lists (see the upsert in /api/sync — `...(seriesImages ? { images } : {})`).
-- A photo uploaded through the UI is not in Drive, so the next sync would
-- silently drop it. This column is owned by the uploader alone and no sync
-- path writes it, which is the only way an uploaded file survives.
--
-- It also has to work for the two Data Center lines, whose sync never reaches
-- that code at all: the line_datasheets upsert is gated on ds_overview_gid,
-- and both lines are ds_scope='model' with no overview tab. For them there is
-- no jsonb to put a hero in.
--
-- Reading order in the layouts is upload-then-Drive: this column wins where
-- it is set, and Orin Box falls back to line_datasheets.images.hero so the
-- existing Drive workflow keeps working untouched.
--
-- Nullable with no default, and nothing reads it as required — a line with no
-- photograph prints its backdrop colour. Deploy order does not matter for the
-- column itself, but the code that SELECTs it does need the column present,
-- so apply this before deploying (a new DB dependency).
alter table public.product_lines
  add column if not exists cover_hero_image text;

comment on column public.product_lines.cover_hero_image is
  'Full-bleed cover photograph for the line''s datasheet (layouts B and D). '
  'Supabase Storage URL, written only by /api/line-cover — never by sync. '
  'Null means the layout prints its solid backdrop instead.';
