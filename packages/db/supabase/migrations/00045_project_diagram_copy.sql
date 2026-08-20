-- A heading and a paragraph for the application diagram.
--
-- The illustration deliberately carries no text: image models garble labels,
-- and "802.3af/at" rendered as plausible-looking nonsense on a customer's
-- datasheet is worse than no label at all. So the words are typeset by the
-- layout instead — real font, real type scale, editable, and translatable
-- later, which a raster baked with text is none of.
--
-- Two fields rather than one blob so the layout can style them differently,
-- and so a heading can exist without forcing prose out of someone who has
-- nothing more to say.

alter table public.project_datasheets
  add column if not exists diagram_title text,
  add column if not exists diagram_note  text;
