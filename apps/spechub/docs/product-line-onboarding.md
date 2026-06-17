# Product-Line Onboarding & Per-Line Datasheet Variants

How to add a new datasheet product line, the sheet contract, and how the
datasheet output varies by product-line `category`.

## Adding a product line (no UI — DB row + sync)

1. **Inspect the line's Google Sheet** to get the tab **GIDs** + verify structure.
   The sheet must be shared with the service account. Quick one-off:
   `node --env-file=apps/spechub/.env.local script.mjs` using `googleapis` +
   `GOOGLE_SERVICE_ACCOUNT_JSON` → `sheets.spreadsheets.get` lists tabs (sheetId =
   gid + title); `drive.files.list` lists the folder (find its `DS Images` subfolder).
2. **Insert a `product_lines` row**: name, label, **category** (drives the datasheet
   theme + cover variant — see below), solution + solution_id, sheet_id, overview_gid,
   detail_specs_gid, comparison_gid, revision_log_gid, ds_prefix (PDF filename prefix —
   e.g. Cloud = `DS_Cloud`, Transceiver = `DS`), drive_folder_id, ds_images_folder_id,
   sort_order.
3. **Sync**: dashboard **Sync** button, or `POST /api/sync?line=<name>`
   (`gateOrCron` — admin/editor session OR `Authorization: Bearer $CRON_SECRET`).
   `CRON_SECRET` via `vercel env pull <file> --environment=production` (the `.vercel`
   link is at the **monorepo root**, not apps/spechub).

Sidebar: a solution with ≥1 product line becomes clickable; empty `kind='product'`
solutions render as disabled "soon" placeholders.

## Sheet contract (what sync reads)

- **(1) Web Overview** tab: col-A rows incl. `Model #` (model columns), `Status`,
  `Headline` or `(Headline)` (decorated labels tolerated), `Single Overview`,
  `Key Feature Lists`.
- **(2) Detail Specs** tab: `Model #` row + category headers (e.g. "Technical
  Specifications") + label/value rows → spec_sections / spec_items.
- **⚠️ Enumeration rule (2026-06-16):** models are enumerated from the **Detail
  Specs** `Model #` row, BUT only those **also listed in the Web Overview** `Model #`
  row are imported. Extra Detail-Specs columns (EOL/example placeholders) are skipped.
  Guard: if a sheet has no Web Overview `Model #` row, falls back to importing all
  columns (legacy). So **a model missing from Web Overview will silently not sync.**
  (`lib/google/sheets.ts` `loadAllProductsFromSheet`.)

## Datasheet output varies by product-line `category`

`preview/[model]/page.tsx`:
- **Theme** (`getTheme`): Cloud (default) = blue `#03a9f4`; `Unmanaged Switches` /
  `Extenders` = gray; **`Transceivers` = green `#2F855A`**. Hardcoded by category,
  NOT from `solutions.color_primary`.
- **Cover + pages**: standard = two-column cover (overview left, product image right) +
  a final "Hardware Overview + Footer" page. **`Transceivers` = `tx-cover`**: product
  image centered below the title, overview full-width below it, **no hardware page**
  (footer moves onto the last spec page) → cover + spec(s) only.
- **QR** (footer): `qrLabel = customQrLabel || (isTransceiver ? "Contact Us" :
  dict.defaultQrLabel)`; URL priority = per-product `qr_url` → line `qr_url_template`
  → (transceiver: Contact Us page | dict default). EN dict default is the `/qsg/{model}`
  QSG link; zh/ja dicts already default to "Contact Us" + regional contact URLs.
  Transceiver EN contact = `https://www.engeniustech.com/contact-us` (hyphen — the
  `_us` underscore form 404s).

Drive folders **auto-create** on first PDF generation: per-model `{ds_prefix}_{model}/`
(search-then-create, reuses existing) and zh/ja **sibling** line folders
`{lineName}_{suffix}` + their `DS Images` (`resolveLocaleLineFolder`). No manual
folder creation needed.

## Detail page + dashboard list also vary by category

- Detail page (`product-detail.tsx`): transceivers hide the **Hardware Image** upload
  slot and drop it from the PDF-readiness checklist; the QR card shows "Contact URL".
- Dashboard list (`dashboard-content.tsx`): transceivers drop the **HW** column and
  rename **Model Name → Description** (showing the `headline`, since transceiver
  subtitle/full_name are empty).

## Breadcrumb back-link

Product-detail + translations breadcrumbs resolve the **solution slug** from the
line's `solution_id` and link to `/dashboard/<slug>?line=...` (previously hardcoded
`/dashboard/cloud`, which broke non-Cloud lines).

## Live lines beyond Cloud

**Accessories ▸ Transceiver** (live): 13 SFP/QSFP/DAC models, green theme, no hardware,
Contact-Us QR. Sheet `1Oz7vEG72x2A3RKh-R00Ut3af7WDy7b-jn2HodA8_6VY`. Open items
(owner-side): product images (flat `{model}_product.png` in DS Images) + zh/ja
translations via the Translations UI.
