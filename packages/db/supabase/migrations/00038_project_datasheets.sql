-- Datasheet on Demand — the PROJECT / TENDER datasheet module.
--
-- Project business means a customer wants custom or not-yet-existing hardware.
-- We get an ODM/other-brand spec sheet, retarget it onto EnGenius naming,
-- imagery and layout, and hand it over to win the deal. The document is a
-- SALES ARTEFACT, not a product document.
--
-- ── Why this is a parallel island, not a flag on `products` ───────────────
-- Every property is the opposite of the catalogue's:
--
--   catalogue                        project datasheet
--   ─────────────────────────────    ────────────────────────────────────
--   source = Google Sheets (PM)      source = an uploaded ODM PDF/XLSX
--   the product exists               the product may never exist
--   one document per model           one document per model PER CUSTOMER
--   maintained for years             archived when the deal closes
--   indexed into RAG                 MUST NEVER be indexed
--
-- That last line is the hard one. If an EOR200 that we merely quoted lands in
-- `products`, EnGenie starts telling people EnGenius sells it. Keeping these
-- in their own tables makes that structurally impossible rather than a rule
-- someone has to remember: `/api/sync` and EnGenie's ingest both read
-- `products`, so they cannot see any of this.
--
-- There is deliberately NO promotion path to `products`. When a customer
-- commits, PM rebuilds the line properly in Google Sheets — see
-- docs/product-line-onboarding.md. A one-click "promote" button would invite
-- treating tender data as real data, which is the failure mode this whole
-- separation exists to prevent.
--
-- ── raw_doc ⊕ rules ───────────────────────────────────────────────────────
-- `raw_doc` is what came out of the source; `rules` is everything a human
-- changed. The final spec table is COMPUTED from the two at render time and
-- is never stored. That is what makes "re-extract with a better model",
-- "the ODM shipped V1.1" and "copy this for the next customer" non-destructive
-- — raw is replaced, the edits survive. The immutable record of what actually
-- went out is the emitted PDF, not a row in here.
--
-- RLS follows the battlecard precedent: authenticated may SELECT, writes only
-- via the service-role admin client. Idempotent for the same reason 00025 is.

-- ── 1. project_datasheets (the deal) ──────────────────────────────────────
create table if not exists public.project_datasheets (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  customer       text,
  status         text not null default 'draft'
                 check (status in ('draft', 'ready', 'archived')),
  -- Which layout renders it. Key into PROJECT_LAYOUTS (lib/project-datasheet/
  -- themes.ts), not a product category — project datasheets pick their look
  -- per deal rather than inheriting one from a product line.
  layout         text not null default 'steel',

  -- Cover / shared copy. The equivalent of `line_datasheets` for a deal.
  headline       text,
  series_name    text,
  category_label text,
  overview       text,
  features       jsonb not null default '[]',
  footnote       text,
  -- Document-level artwork: the network/application diagram, a customer
  -- logo, anything not tied to one model column. [{slot,url,caption}]
  images         jsonb not null default '[]',

  -- PRELIMINARY notice. `not null` + non-blank check is the point: the
  -- WORDING is editable (customer name, validity, house counsel's phrasing),
  -- the EXISTENCE is not. Without it this PDF is indistinguishable from a
  -- real datasheet the moment it leaves the building.
  disclaimer     text not null,

  -- Shown under the hardware renders. Project datasheets routinely ship with
  -- a stand-in photo of a similar EnGenius unit, and a tender document that
  -- shows a product which is not the product, silently, is a misrepresentation
  -- risk. Same contract as `disclaimer`: editable text, but if there are
  -- images there is a note.
  image_note     text,

  -- Which sections render. Package Contents is off by default because at
  -- quoting time there is usually no packaging yet, and printing an empty
  -- section reads as an oversight rather than a stage of the process.
  sections       jsonb not null default
                 '{"features":true,"specs":true,"software":false,"hardware":true,"package":false,"diagram":false}',

  -- What to print in a cell the source never filled. 'tbd' is the default
  -- because in a preliminary document "TBD" is honest and expected, whereas
  -- a blank cell in a side-by-side table reads as a printing fault.
  blank_policy   text not null default 'tbd'
                 check (blank_policy in ('tbd', 'na', 'blank')),

  -- Document-wide spec rules: {hide[],override{},rename{},blank{}}.
  -- Sales requirements arrive as statements about the DOCUMENT ("don't show
  -- the chipset", "it's IP67"), not about one column, and a rule stored per
  -- model is a rule you can hide the chipset on EOR100 and forget on EOR200.
  -- Per-model `rules` layer on top of these and win on conflict. `add` is
  -- deliberately not accepted here — a new row needs a value per model.
  doc_rules      jsonb not null default '{}',

  notes          text,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint project_datasheets_disclaimer_not_blank
    check (length(trim(disclaimer)) > 0)
);

create index if not exists project_datasheets_status_idx
  on public.project_datasheets (status, updated_at desc);

-- ── 2. project_datasheet_sources (what we were given) ─────────────────────
-- Kept for provenance. When a tender spec is challenged months later, the
-- question is always "where did this number come from" — this is the answer.
create table if not exists public.project_datasheet_sources (
  id                   uuid primary key default gen_random_uuid(),
  project_datasheet_id uuid not null
                       references public.project_datasheets(id) on delete cascade,
  kind                 text not null check (kind in ('pdf', 'xlsx', 'text')),
  filename             text,
  -- bucket `project-datasheets`, NOT `datasheets` — a salesperson browsing
  -- the real datasheet bucket must never find a tender draft in it.
  storage_path         text,
  -- All three input kinds normalise to text before extraction, so the
  -- extractor has one input shape instead of three.
  extracted_text       text,
  extraction           jsonb,
  extraction_model     text,
  extracted_at         timestamptz,
  created_at           timestamptz not null default now()
);

create index if not exists project_datasheet_sources_parent_idx
  on public.project_datasheet_sources (project_datasheet_id);

-- ── 3. project_datasheet_models (the columns of the spec table) ───────────
create table if not exists public.project_datasheet_models (
  id                   uuid primary key default gen_random_uuid(),
  project_datasheet_id uuid not null
                       references public.project_datasheets(id) on delete cascade,
  source_id            uuid references public.project_datasheet_sources(id)
                       on delete set null,
  position             int  not null default 0,
  model_name           text not null,          -- EOR100
  display_name         text,                   -- EOR100 4G Indoor / Outdoor Router
  subtitle             text,
  overview             text,
  features             jsonb not null default '[]',
  images               jsonb not null default '[]',  -- [{slot,url,caption}]

  -- Extraction output. Immutable once written — re-extraction REPLACES it.
  -- [{key,label,value,source_page,confidence}]
  raw_doc              jsonb not null default '[]',
  -- Every human edit for THIS column. {hide[],override{},rename{},add[],blank{}}
  -- Layers on top of the parent's doc_rules and wins on conflict.
  -- Keyed by the normalised source label, which is stable because it comes
  -- from a fixed source document. A re-extract that drops a label leaves an
  -- orphaned rule — surfaced in the editor rather than silently discarded.
  rules                jsonb not null default '{}',

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (project_datasheet_id, model_name)
);

create index if not exists project_datasheet_models_parent_idx
  on public.project_datasheet_models (project_datasheet_id, position);

-- ── Storage: its own private bucket ───────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('project-datasheets', 'project-datasheets', false)
on conflict (id) do nothing;

-- ── RLS: authenticated read; writes via service role only ─────────────────
alter table public.project_datasheets        enable row level security;
alter table public.project_datasheet_sources enable row level security;
alter table public.project_datasheet_models  enable row level security;

drop policy if exists "project datasheets read" on public.project_datasheets;
create policy "project datasheets read" on public.project_datasheets
  for select to authenticated using (true);

drop policy if exists "project datasheet sources read" on public.project_datasheet_sources;
create policy "project datasheet sources read" on public.project_datasheet_sources
  for select to authenticated using (true);

drop policy if exists "project datasheet models read" on public.project_datasheet_models;
create policy "project datasheet models read" on public.project_datasheet_models
  for select to authenticated using (true);
