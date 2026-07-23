-- Series-scope datasheets — one datasheet per PRODUCT LINE instead of one per
-- model. First consumer: Edge AI Box ▸ Orin Box (6 models, ONE series PDF).
--
-- Design (方案 A):
--   product_lines.ds_scope        'model' (default, per-model datasheets as
--                                 today) | 'series' (one datasheet for the line)
--   product_lines.ds_overview_gid gid of the "[For DS] Overview & Features"
--                                 tab (key-value rows: Headline / Product
--                                 Series / Overview / Key Features & Benefits /
--                                 Software Architecture)
--   product_lines.ds_specs_gid    gid of the "[For DS] Technical Specifications"
--                                 tab (columnar: Model Name / Model Number
--                                 header rows + flat spec rows; models may be
--                                 PAIRED per column, e.g. "E5-NA08 / E5-NA08W")
--   line_datasheets               synced content + images + version state for
--                                 the series datasheet (1:1 with product_lines)
--
-- Products of a series line keep syncing as normal (dashboard list, compare,
-- EnGenie RAG all stay per-model) — only datasheet generation moves up to the
-- line level.
--
-- RLS: PUBLIC read (the print surface /preview/series/[line] is fetched by
-- Puppeteer via the automation-bypass header — an anonymous session — same
-- posture as products/product_lines/spec_sections); no write policies, so
-- writes only go through the service-role admin client.
--
-- Idempotent on purpose (repo migrations and remote history are not 1:1; may
-- be applied via `supabase db push` or MCP apply_migration).

-- ── 1. product_lines: series-scope config ─────────────────────────────────
alter table public.product_lines
  add column if not exists ds_scope        text not null default 'model',
  add column if not exists ds_overview_gid text,
  add column if not exists ds_specs_gid    text;

alter table public.product_lines
  drop constraint if exists product_lines_ds_scope_check;
alter table public.product_lines
  add constraint product_lines_ds_scope_check
  check (ds_scope in ('model', 'series'));

-- ── 2. line_datasheets: synced series content + version state ─────────────
create table if not exists public.line_datasheets (
  id               uuid primary key default gen_random_uuid(),
  product_line_id  uuid not null unique references public.product_lines(id) on delete cascade,

  -- content from the "[For DS] Overview & Features" tab
  headline         text,
  series_name      text,          -- "Orin Box Series" (cover subtitle)
  category_label   text,          -- header-band label, e.g. "Edge AI Computer"
  overview         text,
  features         jsonb not null default '[]'::jsonb, -- [{title, bullets: []}]
  software_arch    text,          -- Software Architecture paragraph (page 2)

  -- content from the "[For DS] Technical Specifications" tab
  -- {columns: [{name, number}], rows: [{label, values: []}]}
  specs            jsonb not null default '{}'::jsonb,

  -- series_* images pulled from the line's DS Images folder
  -- {hero, cover_product, architecture, hw_pages: [{subtitle, images: []}]}
  images           jsonb not null default '{}'::jsonb,

  -- series PDF version state (versions table stays per-product; series
  -- history is self-contained here)
  current_version  text,
  -- [{version, pdf_storage_path, generated_at, generated_by, changes}]
  version_history  jsonb not null default '[]'::jsonb,

  last_synced_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── 3. RLS ────────────────────────────────────────────────────────────────
alter table public.line_datasheets enable row level security;

drop policy if exists "line_datasheets read" on public.line_datasheets;
drop policy if exists "Public read line_datasheets" on public.line_datasheets;
create policy "Public read line_datasheets" on public.line_datasheets
  for select using (true);
