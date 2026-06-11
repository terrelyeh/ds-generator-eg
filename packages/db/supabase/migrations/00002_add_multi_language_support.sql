-- 1. Product-level translations (Overview + Features, per-product per-locale)
create table product_translations (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references products(model_name) on delete cascade,
  locale text not null,
  translation_mode text not null default 'light' check (translation_mode in ('light', 'full')),
  overview text,
  features jsonb,
  translated_at timestamptz default now(),
  translated_by text,
  unique(product_id, locale)
);

-- 2. Spec label translations (per-product-line, shared across all models in the line)
create table spec_label_translations (
  id uuid primary key default gen_random_uuid(),
  product_line_id uuid not null references product_lines(id) on delete cascade,
  locale text not null,
  original_label text not null,
  translated_label text,
  label_type text not null default 'spec' check (label_type in ('spec', 'section')),
  unique(product_line_id, locale, original_label, label_type)
);

-- 3. Add locale column to versions table (default 'en' for existing records)
alter table versions add column locale text not null default 'en';

-- 4. Add unique constraint for product + version + locale
create unique index versions_product_version_locale_idx
  on versions(product_id, version, locale);

-- 5. Add current_versions JSONB to products (per-locale version tracking)
alter table products add column current_versions jsonb not null default '{}';

-- 6. Migrate existing current_version data into current_versions
update products
set current_versions = jsonb_build_object('en', current_version)
where current_version is not null and current_version != '' and current_version != '0.0';

-- 7. RLS policies (allow all for now, matching existing pattern)
alter table product_translations enable row level security;
alter table spec_label_translations enable row level security;

create policy "Allow all access to product_translations"
  on product_translations for all using (true) with check (true);

create policy "Allow all access to spec_label_translations"
  on spec_label_translations for all using (true) with check (true);

-- 8. Indexes for common queries
create index idx_product_translations_product_locale
  on product_translations(product_id, locale);

create index idx_spec_label_translations_line_locale
  on spec_label_translations(product_line_id, locale);
