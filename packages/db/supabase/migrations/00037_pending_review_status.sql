-- A fourth review state: "submitted, waiting for the reviewer".
--
-- 00034 gave review_status three values and let `draft` mean two different
-- things: "MKT is still editing" and "MKT sent it over, nobody has looked".
-- Two consequences, both seen in production:
--
--   1. The editor had no way to show that a submit had happened. After
--      Save & Confirm on a reviewed locale the badge still read Draft and
--      the button still pulsed amber inviting you to confirm — identical
--      to before you pressed it.
--   2. review_status DEFAULTS to 'draft', so any row that comes into
--      existence (a Preview auto-save on a locale never saved before)
--      lands in the reviewer's queue looking submitted.
--
-- 'pending_review' is only ever reached by an explicit Save on a locale
-- that has a designated reviewer. Locales without one are unaffected:
-- they go draft → approved via self-approve, exactly as before.

alter table public.product_translations
  drop constraint if exists product_translations_review_status_check;

alter table public.product_translations
  add constraint product_translations_review_status_check
  check (review_status in ('draft', 'pending_review', 'changes_requested', 'approved'));

-- Existing drafts split by whether their locale actually has a reviewer.
--
-- A draft in a reviewed locale can only have got there through the submit
-- path (00034's save handler wrote 'draft' on submit), so it is genuinely
-- waiting and must stay in the queue. A draft in a locale with no reviewer
-- was never submitted to anyone — promoting it would invent a work item.
-- On this database that is 1 row moved (es) and 5 left alone (ja).
--
-- Matches localeHasDesignatedReviewer(): review_locales IS NULL is an
-- unscoped reviewer, NOT a designation of every locale.
update public.product_translations t
set review_status = 'pending_review'
where t.review_status = 'draft'
  and exists (
    select 1
    from public.profiles p
    where p.review_locales is not null
      and p.review_locales @> array[t.locale]
  );

comment on column public.product_translations.review_status is
  'draft = MKT still editing, not submitted; pending_review = submitted, awaiting a designated reviewer; changes_requested = reviewer asked for edits (see translation_reviews); approved = PDF generation unlocked. Locales with no designated reviewer skip pending_review entirely (draft -> approved via self-approve).';
