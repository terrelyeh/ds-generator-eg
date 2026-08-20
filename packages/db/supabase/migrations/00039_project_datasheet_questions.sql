-- Gap review — the open questions on a project datasheet.
--
-- The Project Datasheet Builder does not try to produce a finished document
-- in one shot. Sales never has the whole picture at the start, and pretending
-- otherwise just moves the missing information from "unknown" to "silently
-- assumed". The tool's job is to keep asking until the gaps close.
--
-- ── Findings are computed; only STATE lives here ──────────────────────────
-- `lib/project-datasheet/gap-scan.ts` derives findings from the document on
-- every scan — same input, same findings, no LLM. This table stores the part
-- a scan cannot know: whether a human has answered a question or decided it
-- doesn't apply. Same split as `raw_doc ⊕ rules`, for the same reason: the
-- derived half must be free to change when the document does.
--
-- A row is therefore keyed by the finding's stable identity
-- (code, model_id, row_key), and a rescan reconciles rather than replaces:
--
--   finding is new                  → insert as 'open'
--   finding persists, row is open   → leave it
--   finding persists, row answered  → leave it answered
--   finding gone                    → mark 'resolved' (NOT deleted — the
--                                     trail of what was asked and settled is
--                                     the record of how the spec was agreed)
--   finding returns after resolving → back to 'open'
--
-- ── Blocking vs advisory is not stored ───────────────────────────────────
-- Severity is a property of the check, so it comes from the scanner each
-- time. Storing it would let a rule change silently leave old rows carrying
-- the old severity, which is exactly the kind of quiet staleness the whole
-- module is built to avoid.

create table if not exists public.project_datasheet_questions (
  id                   uuid primary key default gen_random_uuid(),
  project_datasheet_id uuid not null
                       references public.project_datasheets(id) on delete cascade,
  -- The finding's identity. `model_id` is a plain uuid rather than an FK:
  -- deleting a column should not delete the record of what was asked about
  -- it, and reconciliation removes the row on the next scan anyway.
  code                 text not null,
  model_id             uuid,
  row_key              text,

  state                text not null default 'open'
                       check (state in ('open', 'answered', 'dismissed', 'resolved')),
  -- What sales/RD/the ODM came back with, verbatim. Turning an answer into a
  -- rule is a separate, deliberate act — an answer that silently rewrote the
  -- spec table would be the least reviewable thing in the module.
  answer               text,
  answered_by          uuid references public.profiles(id) on delete set null,
  answered_at          timestamptz,

  -- Snapshot of the finding as last seen, so the list renders without
  -- re-deriving and an old answered row still says what it was about.
  title                text not null default '',
  detail               text not null default '',
  asked_of             text not null default 'internal',

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- Partial index: nullable columns make a plain unique constraint treat
  -- every (code, null, null) as distinct, which would duplicate every
  -- document-level finding on every scan.
  constraint project_datasheet_questions_shape check (length(code) > 0)
);

create unique index if not exists project_datasheet_questions_identity
  on public.project_datasheet_questions
     (project_datasheet_id, code, coalesce(model_id::text, ''), coalesce(row_key, ''));

create index if not exists project_datasheet_questions_parent_idx
  on public.project_datasheet_questions (project_datasheet_id, state);

alter table public.project_datasheet_questions enable row level security;

drop policy if exists "project datasheet questions read"
  on public.project_datasheet_questions;
create policy "project datasheet questions read"
  on public.project_datasheet_questions
  for select to authenticated using (true);
