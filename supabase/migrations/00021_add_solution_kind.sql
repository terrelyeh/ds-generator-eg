-- Generalize "solution" into a top-level Knowledge Area. Beyond product
-- solutions (Cloud AP/Switch/...), we now also have non-product knowledge
-- buckets — platform/software how-to, department SOPs, new-hire onboarding —
-- so RAG / Ask can serve more than product specs.
--
-- kind='product'  → appears in the product dashboard sidebar (existing rows).
-- kind='knowledge'→ hidden from the product dashboard, but selectable when
--                   tagging knowledge (TaxonomyPicker) and when scoping an Ask
--                   workspace. Content tagged to a knowledge area (no product
--                   line) is retrieved for that whole area (inheritance rule).
--
-- Seeded areas (data, not in this migration): 'marketing' (行銷部門),
-- 'cloud-platform' (Cloud 平台軟體).
alter table public.solutions
  add column if not exists kind text not null default 'product'
  check (kind in ('product','knowledge'));
