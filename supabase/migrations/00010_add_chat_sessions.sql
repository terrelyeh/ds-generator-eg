-- Chat sessions for Ask SpecHub conversation persistence
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'anonymous',   -- future: Supabase Auth user ID
  title text not null default 'New conversation',
  persona text not null default 'default',
  provider text not null default 'gemini-flash',
  messages jsonb not null default '[]',         -- array of {role, content, sources?, provider?}
  message_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for listing user's sessions
create index if not exists chat_sessions_user_idx
  on public.chat_sessions (user_id, updated_at desc);
