-- Internal deal context — who asked, for what, and how big.
--
-- A project datasheet is one document in one negotiation, and after a dozen
-- of them the list stops being self-explanatory: which branch asked, which
-- salesperson is carrying it, is this the 200-unit enquiry or the 5,000-unit
-- one, is the deal still live. Today that lives in someone's memory and in
-- `notes`, which is where information goes to become unsearchable.
--
-- ⚠️ NONE OF THIS PRINTS. `project-preview.tsx` never reads these columns and
-- must not start: a customer-facing quote that names our salesperson, our
-- internal deal stage or the volume we think they'll buy is a document that
-- should never have left the building. They exist for the list and the editor.
--
-- Free text rather than lookups, deliberately. Quantities arrive as
-- "500–1000 台/年" and branches as whatever the person typed; a schema that
-- insists on an integer just moves the real answer into `notes`.

alter table public.project_datasheets
  add column if not exists branch        text,
  add column if not exists sales_owner   text,
  add column if not exists opportunity   text,
  add column if not exists est_quantity  text,
  add column if not exists due_date      date,
  -- The DEAL's state, which is not the DOCUMENT's state (`status`). A sheet
  -- can be finished and sent while the deal is still open, and a deal can be
  -- lost while the sheet sits in draft. Collapsing them would lose whichever
  -- half you didn't ask about.
  add column if not exists deal_stage    text not null default 'inquiry';

alter table public.project_datasheets
  drop constraint if exists project_datasheets_deal_stage_check;
alter table public.project_datasheets
  add constraint project_datasheets_deal_stage_check
  check (deal_stage in ('inquiry', 'quoted', 'waiting', 'won', 'lost'));

create index if not exists project_datasheets_owner_idx
  on public.project_datasheets (sales_owner);
