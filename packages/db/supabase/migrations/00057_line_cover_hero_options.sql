-- A shortlist of cover photographs per line, not just the one in use.
--
-- 00056 gave each line a single cover_hero_image. In practice choosing a
-- cover is comparative: you upload a few, look at each one behind the real
-- headline, and keep the one that works. With one slot that means
-- destroying a candidate to see the next, and no way back.
--
-- So: cover_hero_options holds every uploaded candidate, and
-- cover_hero_image keeps pointing at whichever is ACTIVE. The layouts still
-- read only cover_hero_image, so the print path is untouched by this —
-- which is the reason the active one is a column rather than a flag inside
-- the array.
--
-- Not a separate table: the cap is three, the rows are URLs, and a join
-- would buy nothing but a join.
alter table public.product_lines
  add column if not exists cover_hero_options jsonb not null default '[]'::jsonb;

-- Whatever is already live is the first candidate — otherwise the picker
-- would open empty on a line that visibly has a cover.
update public.product_lines
   set cover_hero_options = jsonb_build_array(cover_hero_image)
 where cover_hero_image is not null
   and cover_hero_options = '[]'::jsonb;

comment on column public.product_lines.cover_hero_options is
  'Uploaded cover-photo candidates (array of Storage URLs, max 3). '
  'cover_hero_image names the active one. Written only by /api/line-cover.';
