-- The original `versions` table had UNIQUE (product_id, version) — locale
-- was missing from the constraint. So once an English v1.0 row existed
-- for a product, inserting a zh-TW v1.0 row for the same product blew up
-- with duplicate key. The generate-pdf route didn't check insert errors,
-- so the failure was silent: products.current_versions still got updated
-- to claim the locale PDF existed, but no actual versions row was written
-- and Drive uploads for the locale silently failed too. Symptom: UI shows
-- "Regenerate v1.0" for the locale but Drive folder is empty.
--
-- Fix: replace with UNIQUE (product_id, version, locale).
-- Backfill done separately for ECC120Z (zh-TW) and ECC500Z (en).

ALTER TABLE versions
  DROP CONSTRAINT IF EXISTS versions_product_id_version_key;

ALTER TABLE versions
  ADD CONSTRAINT versions_product_id_version_locale_key
  UNIQUE (product_id, version, locale);
