-- Trimming the internal panel back to what is actually used.
--
-- `deal_stage` and `est_quantity` were my suggestions, not requirements. In
-- use they turned out to be someone else's job: the deal's stage lives in the
-- CRM and the volume lives on the quote, so both would have been a second
-- copy going stale next to the real one. A field nobody updates is worse than
-- no field, because the next person believes it.
--
-- `due_date` becomes `tender_date`, and text rather than date. What arrives is
-- "2026 Q3", "三月底前", "RFQ 截止 3/14" — a date picker forces one of those
-- into a day that was never agreed, and loses the qualifier that mattered.
-- The name changes too: this is the tender's date, not our internal deadline.
--
-- Safe to drop rather than deprecate: all three are days old and every row is
-- still null (verified before writing this).

alter table public.project_datasheets
  add column if not exists tender_date text;

update public.project_datasheets
   set tender_date = due_date::text
 where due_date is not null and tender_date is null;

alter table public.project_datasheets
  drop column if exists due_date,
  drop column if exists deal_stage,
  drop column if exists est_quantity;

drop index if exists project_datasheets_owner_idx;
create index if not exists project_datasheets_owner_idx
  on public.project_datasheets (sales_owner);
