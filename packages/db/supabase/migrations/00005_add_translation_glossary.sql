create table translation_glossary (
  id uuid primary key default gen_random_uuid(),
  english_term text not null,
  locale text not null,
  translated_term text not null,
  scope text not null default 'global',
  source text not null default 'manual' check (source in ('manual', 'feedback')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(english_term, locale, scope)
);

alter table translation_glossary enable row level security;

create policy "Allow all access to translation_glossary"
  on translation_glossary for all using (true) with check (true);

create index idx_glossary_locale_scope
  on translation_glossary(locale, scope);
