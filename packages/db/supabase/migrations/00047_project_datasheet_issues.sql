-- What was actually sent, and when.
--
-- The tender sheet prints through the BROWSER, not /api/generate-pdf — that
-- was deliberate (00038, and `project-print-toolbar.tsx`): the catalogue path
-- writes a version row, files the PDF in a public bucket and creates a Drive
-- folder, none of which a document that may never be sent should do.
--
-- The cost of that choice was that the system never knew a PDF had been made.
-- The list could only show `updated_at`, which moves when someone edits an
-- internal note — so "when did we last send this" had no answer at all.
--
-- An issue is that answer. It is NOT the catalogue's version system:
--
--   versions          every generated PDF of a shipping product, filed in
--                     Drive, one row per locale, part of the product record
--   issues            a snapshot of what one customer was shown on one day,
--                     kept so that six weeks later we can still say what we
--                     committed to
--
-- ⚠️ `snapshot` stores the RESOLVED document, not ids pointing at live rows.
-- The spec table is `raw_doc ⊕ rules` computed at render (00038) — so a
-- snapshot made of foreign keys would silently change every time someone
-- edited a rule, which is precisely the failure this table exists to prevent.
-- It holds `{doc, models}` in the exact shape `ProjectPreview` takes as props,
-- so replaying an issue is passing it back in.

create table if not exists public.project_datasheet_issues (
  id                    uuid primary key default gen_random_uuid(),
  project_datasheet_id  uuid not null
    references public.project_datasheets (id) on delete cascade,

  -- Per document, 1-based. Assigned by the API under an advisory lock rather
  -- than a sequence: "issue 3 of this deal" is what someone says out loud,
  -- and a global sequence would make it 147.
  issue_no              integer not null,

  issued_at             timestamptz not null default now(),
  issued_by             uuid references public.profiles (id) on delete set null,
  -- Denormalised on purpose. A leaver's profile row can go; who sent the
  -- customer a spec commitment should not go with it.
  issued_by_email       text,

  -- Free text: "sent to Ahmad 8/21", "priced version". Optional.
  note                  text,

  -- { doc: ProjectDatasheet, models: ProjectDatasheetModel[] }
  snapshot              jsonb not null,

  created_at            timestamptz not null default now(),

  constraint project_datasheet_issues_no_unique
    unique (project_datasheet_id, issue_no)
);

create index if not exists project_datasheet_issues_doc_idx
  on public.project_datasheet_issues (project_datasheet_id, issue_no desc);

alter table public.project_datasheet_issues enable row level security;

-- Same shape as the rest of the module: authenticated users may read, all
-- writes go through the service-role admin client behind a permission gate.
drop policy if exists "project_datasheet_issues_select" on public.project_datasheet_issues;
create policy "project_datasheet_issues_select"
  on public.project_datasheet_issues for select
  to authenticated
  using (true);
