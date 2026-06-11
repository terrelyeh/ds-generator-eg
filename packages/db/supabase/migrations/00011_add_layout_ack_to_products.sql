-- Stores per-locale manual layout-overflow acknowledgements. PM ticks
-- "Reviewed OK" on a model's red-flag warning after visually verifying
-- the generated PDF is acceptable (perhaps after adjusting typography
-- settings to fit more text). The Dashboard red/green logic respects
-- this override and shows green for the acknowledged locale.
--
-- Structure:
--   { "en": true, "ja": true, "zh-TW": false }  -- or timestamps if we
-- later want audit history. Keep simple boolean for v1.
--
-- On re-sync or significant content change we should clear the ack so
-- stale confirmations don't hide new problems — that invalidation is
-- TBD in a follow-up.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS layout_ack JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN products.layout_ack IS
  'Per-locale layout overflow acknowledgements. Keys are locale codes (en, ja, zh-TW). When true for a locale, dashboard treats that locale as green even if the heuristic says overflow. Cleared when content changes (TBD).';
