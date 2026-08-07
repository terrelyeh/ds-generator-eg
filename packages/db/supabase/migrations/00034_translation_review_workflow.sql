-- Translation review workflow: branch-office reviewers approve or send
-- back a locale's translation, with comments that can point at a specific
-- field. Built for the Mexico office reviewing es; applies to every locale.
--
-- Why three states rather than the existing boolean: once a reviewer can
-- leave a comment without approving, "wrote feedback, not approved" and
-- "nobody has looked at it" are different situations that `confirmed =
-- false` cannot tell apart. MKT needs to see the first as a work item.

-- ── 1. Three-state review status ───────────────────────────────────────

alter table public.product_translations
  add column if not exists review_status text not null default 'draft'
    check (review_status in ('draft', 'changes_requested', 'approved')),
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

-- Carry the existing boolean over before it stops being the source of truth.
update public.product_translations
set review_status = 'approved'
where confirmed and review_status = 'draft';

-- `confirmed` becomes derived rather than stored, so the two can never
-- disagree. Four readers (generate-pdf gate, preview page, product-detail,
-- the translation editor) keep working untouched; the single writer
-- (/api/translations/product) switches to review_status.
alter table public.product_translations drop column confirmed;
alter table public.product_translations
  add column confirmed boolean
  generated always as (review_status = 'approved') stored;

comment on column public.product_translations.confirmed is
  'Derived from review_status. Read-only — write review_status instead.';
comment on column public.product_translations.review_status is
  'draft = awaiting review; changes_requested = reviewer asked for edits (see translation_reviews); approved = PDF generation unlocked.';

create index if not exists product_translations_review_status_idx
  on public.product_translations (review_status, locale);

-- ── 2. Append-only review log ──────────────────────────────────────────
--
-- A log rather than a comment column on the row: review is a round trip
-- (reviewer comments → MKT edits → reviewer looks again), and a single
-- column would lose the previous round every time. target_field/index let
-- a comment point at "feature #3" instead of describing where in prose.

create table if not exists public.translation_reviews (
  id           uuid primary key default gen_random_uuid(),
  product_id   text not null references public.products(model_name) on delete cascade,
  locale       text not null,
  action       text not null check (action in ('approved', 'changes_requested', 'commented')),
  comment      text,
  -- Which block the comment is about. Null = about the translation overall.
  target_field text check (target_field in ('overview', 'features', 'headline', 'subtitle', 'spec', 'general')),
  -- 0-based position within target_field when it is a list (features).
  target_index integer,
  reviewer_id  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),

  -- Sending something back or commenting without saying why defeats the
  -- point of the feature; approving needs no words.
  constraint translation_reviews_comment_required
    check (action = 'approved' or coalesce(btrim(comment), '') <> '')
);

comment on table public.translation_reviews is
  'Append-only review history per product+locale. Never updated — a new round adds rows.';

create index if not exists translation_reviews_product_locale_idx
  on public.translation_reviews (product_id, locale, created_at desc);

-- ── 3. Per-locale reviewer scope ───────────────────────────────────────
--
-- Roles are global, so a `pm` could otherwise approve Japanese as easily
-- as Spanish. The Mexico office should only be able to sign off on es.
-- NULL means "every locale" so existing reviewers are unaffected.

alter table public.profiles
  add column if not exists review_locales text[];

comment on column public.profiles.review_locales is
  'Locales this user may approve. NULL = all locales. Enforced in @eg/auth, not RLS — app queries run as service-role.';

-- ── 4. RLS ─────────────────────────────────────────────────────────────
-- Deny-all backstop like documents / llm_usage_events: every read and
-- write goes through service-role behind an RBAC gate.

alter table public.translation_reviews enable row level security;
