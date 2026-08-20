-- Requirements intake — sales' note is a SOURCE, not a setting.
--
-- The Project Datasheet Builder already keeps every input it was given in
-- `project_datasheet_sources`, so the answer to "where did this number come
-- from" is always a document rather than a memory. A requirements note from
-- sales ("no Wi-Fi, PoE is 802.3af/at, IP67") is exactly that kind of input:
-- it is the reason half the rules on the document exist, and six months into
-- a tender it is the thing someone will want to reread.
--
-- So it goes in the same table, under its own `kind`. The distinction from
-- 'text' matters: a 'text' source is pasted SPEC content that extraction will
-- turn into `raw_doc` rows, while 'requirements' is INSTRUCTIONS about the
-- document. Feeding one to the other's pipeline would either bury the specs
-- in prose or turn sales' shorthand into spec rows.
--
-- `extraction` holds the parsed proposal plus which items a human accepted —
-- the record of what was proposed and what was actually taken, which is not
-- recoverable from the rules alone once they are merged.

alter table public.project_datasheet_sources
  drop constraint if exists project_datasheet_sources_kind_check;

alter table public.project_datasheet_sources
  add constraint project_datasheet_sources_kind_check
  check (kind in ('pdf', 'xlsx', 'text', 'requirements'));
