-- Seeding a project datasheet from a SHIPPING EnGenius model.
--
-- The second use case for the builder, and the more common one in practice:
-- a tender asks for a product we already sell, but at a level of detail the
-- public datasheet deliberately omits. Our sheets are written for buyers, so
-- they leave out the deep technical specs a government or telco tender scores
-- on. Rather than retyping the whole thing, start from the real model's specs
-- and add the rows the public sheet doesn't carry.
--
-- ── The direction matters ────────────────────────────────────────────────
-- Catalogue → project is safe and is the ONLY direction that will ever be
-- allowed. Project → catalogue stays impossible (see 00038): a quote may
-- never become a product record. Reading a product's specs into a project
-- island copies values; it does not create a path back.
--
-- ── Why it needs its own `kind` ─────────────────────────────────────────
-- The gap review has to treat it differently from an ODM sheet, in opposite
-- directions on the two checks that matter most:
--
--   ODM sheet     adding a spec the source lacks = we invented a number  → blocking
--   catalogue     adding a spec the source lacks = the entire point      → advisory
--
--   ODM sheet     changing a value = we are speccing a product that doesn't exist yet
--   catalogue     changing a value = our document now contradicts the PUBLISHED
--                 datasheet for a product the customer can already buy, and they
--                 can put the two side by side
--
-- Without the distinction the review would either block the normal workflow
-- or wave through the one thing that can actually be caught out.

alter table public.project_datasheet_sources
  drop constraint if exists project_datasheet_sources_kind_check;

alter table public.project_datasheet_sources
  add constraint project_datasheet_sources_kind_check
  check (kind in ('pdf', 'xlsx', 'text', 'requirements', 'catalog'));
