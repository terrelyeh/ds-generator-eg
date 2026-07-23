-- Datasheet-specific grouped features for per-model datasheets whose cover
-- uses the "chip + bold title + description" style (first: Data Center's
-- Edge Network Appliance / AI Server lines, navy layout).
--
-- Source: a new OPTIONAL "DS Feature Groups" row on the (1)Web -Overview tab.
-- The existing "Key Feature Lists" row stays untouched (the website keeps
-- consuming flat bullets); lines without the new row sync NULL here and the
-- layout falls back to rendering the flat features list.
--
-- Shape: [{ "title": "Performance | Efficient Edge Compute", "bullets": [...] }]
-- ("Chip | Bold Title" split happens at render time.)

alter table public.products
  add column if not exists ds_features jsonb;
