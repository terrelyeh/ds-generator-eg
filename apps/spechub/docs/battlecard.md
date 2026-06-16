# Competitor Battlecard — Architecture

> Internal-only competitor spec comparison. Cloud AP MVP. Added 2026-06-16
> (migration `00025`). Not printed on customer-facing datasheets.

## What it is

PM lines up EnGenius anchor models against competitor models and compares their
key specs side by side. Competitor specs are AI-extracted **drafts** that a PM
confirms before they count — reusing the translation Draft/Confirmed contract.

## Data model (5 tables, migration `00025_add_battlecard.sql`)

```
competitors (brand)
  └─ competitor_products (model; FK product_line_id + datasheet_url)
competitor_matchups   = anchor_model_name × competitor_product_id × TIER
battlecard_dimensions = per-product-line comparison row template
battlecard_values     = one cell per (dimension × owner)
```

- **Tier is RELATIONAL** — it lives on `competitor_matchups`, not on the
  competitor. Unique key is `(anchor_model_name, competitor_product_id)`, so the
  same competitor model can be T1 vs ECW536 and T2 vs ECW230.
- **`battlecard_values`** has two nullable FKs (`anchor_model_name` |
  `competitor_product_id`) + a CHECK that exactly one is set. Uniqueness via two
  **partial unique indexes** (nullable FKs can't use a table unique constraint).
  Each cell carries `confirmed` + `source_url` + `captured_at` +
  `extraction_method` (`manual` | `ai_firecrawl` | `web_search` | `seed_spec_items`).
- **RLS**: authenticated SELECT only; no write policy → all writes go through the
  service-role admin client.
- Seed: `packages/db/supabase/seeds/battlecard-cloud-ap.sql` (3 competitors,
  6 matchups, 28 Cloud AP dimensions). EnGenius self values were seeded from
  `spec_items` via `lib/battlecard/spec-mapping.ts`.

## UI + flow

Page `/battlecard/[line]` (resolves line by `product_lines.name`, like compare),
gated `battlecard.view` (admin/editor/pm). Server component aggregates matchups +
dimensions + values into per-anchor groups → client
`components/battlecard/battlecard-view.tsx` (forked from compare-table's visual
language: anchor **tabs**, tier badges, **amber draft cells**, source-on-hover,
live confirm progress).

Three ways to fill cells (all land as drafts unless confirmed):
- **Manual** inline edit → **Save** (draft) / **Save & Confirm**.
- **↻ sync** (per competitor) — scrape the competitor's official `datasheet_url`
  (firecrawl) + Claude extract → refresh all non-confirmed cells.
- **🔍 web** (per competitor) — general firecrawl web search → Claude extract →
  fill only EMPTY cells, each tagged with the source page it came from.
- **Confirm all drafts** (per table) — bulk-confirm every filled, unconfirmed
  competitor cell.

API routes (`api/battlecard/`): `value` (single-cell upsert), `matchup`
(competitor CRUD: POST/PATCH tier/DELETE), `resync` (datasheet), `websearch`
(web fill empties), `confirm-all` (bulk confirm).

## Gotchas (read before changing battlecard)

1. **`confirmed` only goes up** — a plain Save (no `confirm`) must never set
   confirmed back to false. Same contract as translations.
2. **Auto-extraction never overwrites confirmed cells** — `resync` only touches
   non-confirmed cells; `websearch` only touches empty cells.
3. **New DB tables must be hand-added to `database.generated.ts`** (the client's
   type source) AND `database.ts` (aliases). `supabase gen types` was NOT re-run.
   Forgetting generated.ts → `.from("new_table")` fails to compile.
4. **`↻ sync` / `🔍 web` need `FIRECRAWL_API_KEY`** (env; set on Vercel
   prod/dev/preview) + an Anthropic key (via `app_settings` `getApiKey`). The
   Vercel CLI needs the branch for preview env:
   `vercel env add NAME preview <branch> --value X --yes`. The `.vercel/` link is
   at the **monorepo root**, not `apps/spechub`.
5. **Never use the `comparisons` "delete-then-reinsert" write pattern here** —
   battlecard always upserts, or it would wipe PM-confirmed cells.

## MVP scope / pending

- Only **Cloud AP** has a dimension template + matchups; dashboard toolbar
  Battlecard link shows for Cloud AP only. Switch / NVS / VPN FW not built yet.
- Cisco Meraki cells are sparse (marketing pages lack hard numbers) — fill via
  ↻ sync / 🔍 web or manually.
- 5 dimensions intentionally left blank for PM judgement: MLO, Recommended
  Users, BSS Coloring, Warranty, MSRP.
- Decision (2026-06-16): ↻ sync and 🔍 web stay as two separate manual buttons —
  not auto-chained on add.
