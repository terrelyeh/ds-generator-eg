-- A confidentiality marking, distinct from the PRELIMINARY notice.
--
-- They make different claims and one cannot stand for the other:
--
--   PRELIMINARY      the numbers may still change
--   CONFIDENTIAL     this document is not for general circulation
--
-- A sheet can be either without being the other, and a reader needs to know
-- which applies.
--
-- ⚠️ NOT "internal use only", tempting as the phrase is. This document's
-- entire purpose is to be handed to a customer — that is what "approach a
-- project" means. Stamping it internal-only tells the recipient they are
-- holding something they should not have, which is both untrue and a bad
-- first impression on a bid. What is actually meant is "not public": it does
-- not go on the website, into a channel portal, or to anyone outside the
-- evaluation. The default wording says that instead.
--
-- Nullable, unlike `disclaimer`. A tender sheet built from a sourced vendor's
-- specs is genuinely sensitive; one assembled from models we already ship and
-- publish may not be, and forcing a confidentiality stamp onto a document
-- that doesn't need one is how people learn to ignore the stamp.

alter table public.project_datasheets
  add column if not exists confidentiality text
    default 'CONFIDENTIAL — Provided for tender evaluation. Not for public distribution.';

-- Existing rows predate the column and would otherwise carry no marking at
-- all; the default only applies to inserts.
update public.project_datasheets
   set confidentiality = 'CONFIDENTIAL — Provided for tender evaluation. Not for public distribution.'
 where confidentiality is null;
