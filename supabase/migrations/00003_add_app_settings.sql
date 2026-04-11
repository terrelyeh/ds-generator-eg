-- App-level settings (API keys, etc.)
create table app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

alter table app_settings enable row level security;

create policy "Allow all access to app_settings"
  on app_settings for all using (true) with check (true);
