-- Icon catalog for Ask SpecHub topology diagrams.
--
-- Standalone catalog (intentionally NOT a foreign key to products) so it can
-- hold non-product nodes too — PDUs, outdoor bridges, and generic infra icons
-- (Internet/cloud, modem, server, client). The Ask topology renderer resolves
-- a node's `key` → `url`; `role` drives diagram layering; the LLM is given a
-- compact catalog (key + role) so it only places devices that have an icon.
--
-- Populated by scripts/upload-topology-icons.mjs (idempotent; scans the
-- Product Icons folder, uploads to the public "topology-icons" Storage bucket,
-- upserts rows). filename convention: {key}-{view}.png

create table if not exists public.topology_icons (
  key          text not null,
  view         text not null default 'default',
  label        text,
  role         text,
  url          text not null,
  storage_path text,
  model_name   text,
  width        integer,
  height       integer,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (key, view)
);

comment on table public.topology_icons is 'Icon catalog for Ask SpecHub topology diagrams (standalone, not FK to products). key = filename minus view suffix; view = a/b/front/iso; role drives diagram layering; url = public Storage URL.';

alter table public.topology_icons enable row level security;

drop policy if exists "topology_icons public read" on public.topology_icons;
create policy "topology_icons public read" on public.topology_icons
  for select using (true);
