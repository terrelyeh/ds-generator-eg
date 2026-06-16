-- Competitor comparison "battlecard" — an INTERNAL-only module (not printed on
-- customer-facing datasheets). PM picks a competitor + model + tier and we build
-- a side-by-side spec table of EnGenius models vs competitors.
--
-- Four-level model + a relational matchup table:
--   competitors (brand) → competitor_products (model) → competitor specs
--   competitor_matchups  = who-fights-whom + TIER (tier is RELATIONAL: relative
--                          to a specific EnGenius anchor model, not a fixed
--                          property of the competitor — same competitor can be
--                          T1 vs ECW536 but T2 vs ECW230).
--   battlecard_dimensions= per-product-line canonical comparison rows (template).
--   battlecard_values    = one cell per (dimension × owner), where owner is
--                          EITHER an EnGenius model OR a competitor product.
--                          Carries per-cell confirmed flag + source_url +
--                          captured_at (legal/audit trail + Draft/Confirmed gate
--                          reused from the translation flow).
--
-- RLS: internal-only — authenticated may SELECT; no insert/update/delete policy,
-- so writes only go through the service-role admin client (createAdminClient).
-- anon (public datasheet surface) cannot read any of this.
--
-- Idempotent on purpose (create ... if not exists / drop policy if exists):
-- the repo's migration files and the remote migration history are not 1:1, so
-- this may be applied via either `supabase db push` or MCP apply_migration.

-- ── 1. competitors (brand) ────────────────────────────────────────────────
create table if not exists public.competitors (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  brand_family  text,
  homepage_url  text,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

-- ── 2. competitor_products (model) ────────────────────────────────────────
create table if not exists public.competitor_products (
  id              uuid primary key default gen_random_uuid(),
  competitor_id   uuid not null references public.competitors(id) on delete cascade,
  model_name      text not null,
  display_name    text,
  product_line_id uuid not null references public.product_lines(id) on delete restrict,
  datasheet_url   text,
  source_url      text,
  captured_at     timestamptz,
  notes           text,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  unique (competitor_id, model_name)
);
create index if not exists competitor_products_line_idx
  on public.competitor_products (product_line_id);

-- ── 3. competitor_matchups (relational tier) ──────────────────────────────
create table if not exists public.competitor_matchups (
  id                    uuid primary key default gen_random_uuid(),
  product_line_id       uuid not null references public.product_lines(id) on delete cascade,
  anchor_model_name     text not null references public.products(model_name) on delete cascade,
  competitor_product_id uuid not null references public.competitor_products(id) on delete cascade,
  tier                  smallint not null check (tier in (1,2,3)),
  positioning           text,
  enabled               boolean not null default true,
  sort_order            int not null default 0,
  created_at            timestamptz not null default now(),
  unique (anchor_model_name, competitor_product_id)
);
create index if not exists competitor_matchups_line_idx
  on public.competitor_matchups (product_line_id);

-- ── 4. battlecard_dimensions (per-line row template) ──────────────────────
create table if not exists public.battlecard_dimensions (
  id              uuid primary key default gen_random_uuid(),
  product_line_id uuid not null references public.product_lines(id) on delete cascade,
  category        text not null,
  dimension_key   text not null,
  label           text not null,
  unit            text,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  unique (product_line_id, dimension_key)
);

-- ── 5. battlecard_values (one cell; EnGenius OR competitor) ────────────────
create table if not exists public.battlecard_values (
  id                    uuid primary key default gen_random_uuid(),
  dimension_id          uuid not null references public.battlecard_dimensions(id) on delete cascade,
  -- exactly one owner: an EnGenius model OR a competitor product
  anchor_model_name     text references public.products(model_name) on delete cascade,
  competitor_product_id uuid references public.competitor_products(id) on delete cascade,
  value                 text not null default '',
  confirmed             boolean not null default false,
  source_url            text,
  captured_at           timestamptz,
  extraction_method     text,  -- 'manual' | 'ai_firecrawl' | 'seed_spec_items'
  confirmed_by          uuid references public.profiles(id) on delete set null,
  confirmed_at          timestamptz,
  updated_at            timestamptz not null default now(),
  constraint battlecard_values_one_owner check (
    (anchor_model_name is not null) <> (competitor_product_id is not null)
  )
);
-- partial unique indexes (nullable FKs → cannot use table unique constraint)
create unique index if not exists battlecard_values_self_uniq
  on public.battlecard_values (dimension_id, anchor_model_name)
  where anchor_model_name is not null;
create unique index if not exists battlecard_values_comp_uniq
  on public.battlecard_values (dimension_id, competitor_product_id)
  where competitor_product_id is not null;

-- ── RLS: authenticated read-only; writes via service role only ─────────────
alter table public.competitors           enable row level security;
alter table public.competitor_products   enable row level security;
alter table public.competitor_matchups   enable row level security;
alter table public.battlecard_dimensions enable row level security;
alter table public.battlecard_values     enable row level security;

drop policy if exists "battlecard read competitors" on public.competitors;
create policy "battlecard read competitors" on public.competitors
  for select to authenticated using (true);

drop policy if exists "battlecard read competitor_products" on public.competitor_products;
create policy "battlecard read competitor_products" on public.competitor_products
  for select to authenticated using (true);

drop policy if exists "battlecard read competitor_matchups" on public.competitor_matchups;
create policy "battlecard read competitor_matchups" on public.competitor_matchups
  for select to authenticated using (true);

drop policy if exists "battlecard read battlecard_dimensions" on public.battlecard_dimensions;
create policy "battlecard read battlecard_dimensions" on public.battlecard_dimensions
  for select to authenticated using (true);

drop policy if exists "battlecard read battlecard_values" on public.battlecard_values;
create policy "battlecard read battlecard_values" on public.battlecard_values
  for select to authenticated using (true);
