-- ============================================================
-- EnGenius Datasheet System — Initial Schema
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. Product Lines (Cloud Camera, Cloud AP, Cloud Switch)
-- ============================================================
create table product_lines (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,              -- e.g. "Cloud Camera"
  label text not null,                    -- e.g. "AI Cloud Cameras"
  category text not null,                 -- e.g. "Cameras"
  sheet_id text,                          -- Google Sheet ID
  overview_gid text,                      -- Web Overview tab GID
  detail_specs_gid text,                  -- Detail Specs tab GID
  created_at timestamptz not null default now()
);

-- ============================================================
-- 2. Products
-- ============================================================
create table products (
  id uuid primary key default uuid_generate_v4(),
  product_line_id uuid not null references product_lines(id) on delete cascade,
  model_name text not null unique,        -- e.g. "ECC100"
  subtitle text not null default '',      -- e.g. "Cam5MP Dome IP67"
  full_name text not null default '',     -- e.g. "Cloud Managed AI Outdoor Dome with 256GB Storage"
  overview text not null default '',      -- Product description paragraph
  features text[] not null default '{}',  -- Array of feature strings
  product_image text not null default '', -- Image URL or Drive file ID
  hardware_image text not null default '', -- Hardware overview image
  current_version text not null default '0.0',
  sheet_last_modified timestamptz,        -- Last modified time from Google Sheets API
  sheet_last_editor text,                 -- Email of last editor from Sheets API
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 3. Spec Sections (groups of specs under a category)
-- ============================================================
create table spec_sections (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  category text not null,                 -- e.g. "Optics", "Video", "Audio"
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 4. Spec Items (individual label/value pairs)
-- ============================================================
create table spec_items (
  id uuid primary key default uuid_generate_v4(),
  section_id uuid not null references spec_sections(id) on delete cascade,
  label text not null,                    -- e.g. "Sensor"
  value text not null,                    -- e.g. "1/2.8\" Sony Starvis 5MP CMOS"
  sort_order int not null default 0
);

-- ============================================================
-- 5. Hardware Labels (annotations on hardware overview image)
-- ============================================================
create table hardware_labels (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  text text not null,                     -- e.g. "Lens"
  position text not null default '',      -- e.g. "top-left", "right"
  sort_order int not null default 0
);

-- ============================================================
-- 6. Image Assets (track required images per product)
-- ============================================================
create type image_type as enum (
  'product',
  'hardware',
  'radio_pattern',
  'packaging',
  'application'
);

create type image_status as enum (
  'missing',
  'uploaded',
  'approved'
);

create table image_assets (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  image_type image_type not null,
  label text not null default '',         -- Display label, e.g. "Front View"
  file_url text,                          -- Supabase Storage URL or Drive URL
  drive_file_id text,                     -- Google Drive file ID (if applicable)
  status image_status not null default 'missing',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, image_type, label)
);

-- ============================================================
-- 7. Versions (PDF version history)
-- ============================================================
create table versions (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  version text not null,                  -- e.g. "1.0", "1.1"
  changes text not null default '',       -- What changed in this version
  pdf_storage_path text,                  -- Path in Supabase Storage
  generated_by uuid references auth.users(id),
  generated_at timestamptz not null default now(),
  unique(product_id, version)
);

-- ============================================================
-- 8. Change Logs (tracks Google Sheets edits)
-- ============================================================
create table change_logs (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid references products(id) on delete set null,
  product_line_id uuid references product_lines(id) on delete set null,
  edited_by text,                         -- Email from Google Sheets API
  edited_at timestamptz,                  -- Timestamp from Google Sheets API
  changes_summary text not null default '',
  notified boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 9. Profiles (extends Supabase auth.users)
-- ============================================================
create type user_role as enum ('admin', 'pm', 'mkt', 'viewer');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role user_role not null default 'viewer',
  product_line_ids uuid[] not null default '{}', -- Which product lines this user can access
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Indexes
-- ============================================================
create index idx_products_product_line on products(product_line_id);
create index idx_products_model_name on products(model_name);
create index idx_spec_sections_product on spec_sections(product_id);
create index idx_spec_items_section on spec_items(section_id);
create index idx_hardware_labels_product on hardware_labels(product_id);
create index idx_image_assets_product on image_assets(product_id);
create index idx_versions_product on versions(product_id);
create index idx_change_logs_product on change_logs(product_id);
create index idx_change_logs_notified on change_logs(notified) where not notified;

-- ============================================================
-- Auto-update updated_at trigger
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_products_updated_at
  before update on products
  for each row execute function update_updated_at();

create trigger trg_image_assets_updated_at
  before update on image_assets
  for each row execute function update_updated_at();

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

-- ============================================================
-- RLS (Row Level Security) — basic setup
-- ============================================================
alter table product_lines enable row level security;
alter table products enable row level security;
alter table spec_sections enable row level security;
alter table spec_items enable row level security;
alter table hardware_labels enable row level security;
alter table image_assets enable row level security;
alter table versions enable row level security;
alter table change_logs enable row level security;
alter table profiles enable row level security;

-- Public read access for all product data (datasheets are public)
create policy "Public read product_lines" on product_lines for select using (true);
create policy "Public read products" on products for select using (true);
create policy "Public read spec_sections" on spec_sections for select using (true);
create policy "Public read spec_items" on spec_items for select using (true);
create policy "Public read hardware_labels" on hardware_labels for select using (true);
create policy "Public read image_assets" on image_assets for select using (true);
create policy "Public read versions" on versions for select using (true);
create policy "Public read change_logs" on change_logs for select using (true);

-- Profiles: users can read their own profile
create policy "Users read own profile" on profiles for select using (auth.uid() = id);

-- Authenticated users can insert/update (will refine with roles later)
create policy "Authenticated insert products" on products for insert to authenticated with check (true);
create policy "Authenticated update products" on products for update to authenticated using (true);
create policy "Authenticated insert spec_sections" on spec_sections for insert to authenticated with check (true);
create policy "Authenticated update spec_sections" on spec_sections for update to authenticated using (true);
create policy "Authenticated insert spec_items" on spec_items for insert to authenticated with check (true);
create policy "Authenticated update spec_items" on spec_items for update to authenticated using (true);
create policy "Authenticated insert versions" on versions for insert to authenticated with check (true);
create policy "Authenticated insert change_logs" on change_logs for insert to authenticated with check (true);
create policy "Authenticated update change_logs" on change_logs for update to authenticated using (true);
create policy "Authenticated insert image_assets" on image_assets for insert to authenticated with check (true);
create policy "Authenticated update image_assets" on image_assets for update to authenticated using (true);

-- ============================================================
-- Seed: Product Lines
-- ============================================================
insert into product_lines (name, label, category, sheet_id, overview_gid, detail_specs_gid) values
  ('Cloud Camera', 'AI Cloud Cameras', 'Cameras', '1jQUW9vvqzWEx-pMfPtSxUhf-Ov81cQzzSx16-YX1wqU', '2086236498', '180970413'),
  ('Cloud AP', 'Cloud Access Points', 'APs', '1WFQHS8LnjzIrAJa-Fih3qWCFICagbCQE9jML-ziwUwM', '1507745148', '822333768'),
  ('Cloud Switch', 'Cloud Managed Switches', 'Switches', '1FkKUH-heE2VwlBsHo1XdPqW1MsQCT27JmFWlVV-Mwjk', '0', '319325917');

-- ============================================================
-- Storage Bucket for PDFs
-- ============================================================
-- Run this separately in Supabase Dashboard or via supabase CLI:
-- insert into storage.buckets (id, name, public) values ('datasheets', 'datasheets', true);
