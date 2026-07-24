# Product-Line Onboarding & Per-Line Datasheet Variants

How to add a new solution / product line, the Google Sheet contract, and how
the datasheet output varies by product-line `category`.

## 1. Adding a product line (no UI — DB row + sync)

1. **Inspect the line's Google Sheet** to get the tab **GIDs** + verify
   structure. The sheet must be shared with the service account. One-off:
   `node --env-file=apps/spechub/.env.local script.mjs` using `googleapis` +
   `GOOGLE_SERVICE_ACCOUNT_JSON` → `sheets.spreadsheets.get` lists tabs
   (sheetId = gid + title). **`GOOGLE_SERVICE_ACCOUNT_JSON` is base64** —
   decode before `JSON.parse`.
2. **Insert a `product_lines` row**: name, label, **category** (drives the
   datasheet variant — see §4), solution + solution_id, sheet_id,
   overview_gid, detail_specs_gid, comparison_gid, revision_log_gid,
   ds_prefix (PDF filename prefix), drive_folder_id, ds_images_folder_id,
   sort_order. A brand-new solution also needs a `solutions` row
   (`kind='product'`); several placeholder solutions already exist.
3. **Sync**: dashboard **Sync** button, or `POST /api/sync?line=<name>`
   (`gateOrCron` — admin/editor session OR `Authorization: Bearer
   $CRON_SECRET`; locally the `x-vercel-cron: 1` header also works).

Sidebar: a solution with ≥1 product line becomes clickable; empty
`kind='product'` solutions render as disabled "soon" placeholders.

⚠️ **`drive_folder_id` vs `ds_images_folder_id` are easy to swap** (pitfall
#53). drive_folder_id = the line folder that holds per-model `DS_*` folders;
ds_images_folder_id = the `DS Images` subfolder inside it. Drive layouts vary
between lines (Data Center nests them under `<Line>/Datasheet/Model
Datasheet/`), so walk the tree before filling them in.

## 2. Sheet contract (what sync reads)

- **`(1) Web Overview`** tab, col-A row labels:
  - `Model #` — the model columns. **`Model Number` is a tolerated alias.**
  - `Status` — blank/`Active` → active; `Upcoming` **or `PVT`** → upcoming;
    `Pending` → pending.
  - `Headline`, `Single Overview`, `Key Feature Lists` (decorated labels
    tolerated, e.g. `(Headline)`).
  - **`DS Feature Groups`** — OPTIONAL. Grouped marketing copy for
    chip-style datasheet covers, parsed into `products.ds_features`
    (`[{title, bullets[]}]`). Format:
    ```
    Chip Label | Bold Title:
    - One-sentence description.
    ```
    Lines ending `:` open a group; `- ` lines are its bullets. NULL here →
    the layout falls back to the flat `Key Feature Lists` bullets. The
    website keeps consuming `Key Feature Lists` either way.
- **`(2) Detail Specs`** tab: `Model #` row + category headers + label/value
  rows → spec_sections / spec_items. A row whose model columns are ALL empty
  is treated as a **category header** — tell PMs to put `-` in
  not-applicable cells or the row silently becomes a section title.
- **⚠️ Enumeration rule:** models come from the **Detail Specs** `Model #`
  row, but only those **also listed in Web Overview** are imported. Extra
  Detail-Specs columns (EOL/example placeholders) are skipped — and a model
  missing from Web Overview **silently does not sync**.
  (`lib/google/sheets.ts` `loadAllProductsFromSheet`.)
- **Sheets shared between lines**: `model_name` is a global primary key. If
  two lines' Web Overview tabs list the same model, they fight over it every
  sync. Strip duplicates from the sheet that doesn't own the model.

## 3. Images

Flat files in the line's `DS Images` folder, **single underscore**:

| File | Purpose |
|---|---|
| `{model}_product.png` | cover product shot |
| `{model}_hardware.png` | Hardware Overview render |
| `{model}_hardware_2.png` | 2nd render (front/rear) — Data Center lines |
| `{model}_{Group}_{Plane}.png` | antenna patterns — see below |

- **PNG transparent padding is auto-trimmed on sync** (sharp `.trim()`).
  PM renders often sit on huge transparent canvases (SE110's product filled
  61%×24% of a 3800×2850 canvas and rendered tiny). PNG only — JPG white
  margins may be intentional. Drive originals are untouched.
- PMs frequently mis-name files (`SE110__hardware1.png`). The service
  account has Drive **edit** rights, so renaming in place + resync is faster
  than a round trip.
- Columns are `NOT NULL DEFAULT ''` → **empty string means "never
  supplied"**, not "cleared" (pitfall #60).
- Locale folders (`<Line>_zh` / `_ja`) and per-model `DS_*` folders
  **auto-create** on first PDF generation.

## 4. Datasheet output varies by product-line `category`

**Category-driven traits belong in `lib/datasheet/qr.ts`**
(`usesContactUsQr`, `usesTwoHardwareImages`) — NOT inline in components.
Scattered copies are how the product page ended up advertising a QSG URL
while the datasheet printed Contact Us, and how a substring `isAP` test grew
a Radio Pattern column on "Edge Network Appli**ap**nces" (pitfall #61).
**Always compare categories exactly.**

**Antenna-pattern slots are derived per PRODUCT** (`lib/datasheet/radio-patterns.ts`),
not per line — Broadband EOC needs two shapes on one line:

| category | slots |
|---|---|
| `APs` | `2.4G` / `5G` (+ `6G` when Operating Frequency says so) × H/E |
| `Broadband APs` | model name says CPE → `Port1` / `Port2`; otherwise `2.4G` / `5G` |

The slot label doubles as the file-name stem (`EOC600_Port1_H-plane.png`),
so renaming a label orphans uploaded art. A page renders whenever a product
defines slots — missing plots show placeholders, same as Product Views.

### Existing variants

| Variant | Categories | Shape |
|---|---|---|
| **Cloud (default)** | APs, Switches, Cameras, NVS, Firewalls… | blue `#03a9f4`; two-column cover; spec pages; Hardware Overview + footer |
| **Gray** | Unmanaged Switches, Extenders | as above, `#58595B` |
| **Transceiver** | Transceivers | green `#2F855A`; `tx-cover` (image centred, overview full-width); **no hardware page** (footer moves to the last spec page); Contact-Us QR; list drops HW column, Model Name → Description |
| **Data Center** | Edge Network Appliances, AI Servers | dedicated component `preview/[model]/datacenter-preview.tsx`; navy hero + 8 chip features, shared EDCC page, full-width spec table, 2 hardware renders, Contact-Us QR |
| **Broadband** | Broadband APs | `preview/[model]/broadband-preview.tsx`, steel `#1e6796`; renders BOTH scopes (see §5); cover hero art, Features & Benefits, spec table (single or comparison), Product Views, Antenna Patterns |
| **Edge AI** | Edge AI Computers | `preview/series/[line]/edge-ai-series-preview.tsx`, teal `#86c9cf`; **series only** — 5 fixed pages: cover / Software Architecture / curated comparison table / Hardware Overview per variant group |

Cloud/gray/transceiver live in `preview/[model]/page.tsx` (`getTheme` +
conditional classes). **A structurally different layout is cleaner as its own
component**, branched by category near the top of `page.tsx` — the URL stays
`/preview/{model}` so generate-pdf and product links need no changes.

### Building a new variant — what bit us

- **Trace the reference PDF, don't eyeball it.** `pymupdf` gives exact
  spans/rects/colors. The DC reference page is 613×860, so vertical values
  scale ×0.921 to Letter.
- **Flow, not fixed offsets**, for anything after variable-length copy —
  a 3-line headline collided with the model line when tops were hard-coded.
- **Auto-fit long copy** rather than hand-tuning per model: estimate wrapped
  height, step a narrow size ladder (e.g. 10/9.5/9pt). **Calibrate the
  width factor against rendered output** — a guessed 0.586 over-counted
  lines ~10% and shrank copy two steps for nothing (0.531 was correct for
  Manrope Light).
- Keep the size ladder narrow so a family of datasheets still looks alike.
- Cloud-template pagination constants must track preview CSS
  (pitfalls #50/#51).
- **Reference art usually has text baked in.** The EOC hero contains its own
  headline and the deployment diagram its own caption — cropping naively
  double-printed both. Crop past the baked text, then draw live text.
- **Anchor the footer to the LAST page, not a section.** Pinning it to the
  antenna page made it vanish on lines with no plots uploaded.
- Narrow comparison columns need `overflow-wrap: anywhere`, or tokens like
  `station(BSU)/subscriber(SU)` bleed out of the cell.

## 5. Datasheet scope (`product_lines.ds_scope`)

| scope | ships | per-model generate |
|---|---|---|
| `model` (default) | one datasheet per model | yes |
| `series` | ONE datasheet for the line | hidden |
| `both` | both, sharing content | yes |

**Line-level shared content** lives in `line_datasheets` (migration 00029 +
00032) and is fed by an optional `[For DS] Overview & Features` tab —
a single-column key-value sheet read by `loadLineDatasheetContent`:

| row | feeds |
|---|---|
| `Headline` / `Product Series` / `Category Label` | cover identity |
| `DS Feature Groups` | cover marketing blocks (`Title:` + `- body`) |
| `Features & Benefits` | flat bullet list |
| `Software Architecture` / `Footnote` | optional blocks |

⚠️ **Label the cover-blocks row `DS Feature Groups`.** Orin Box's tab called
it `Key Features & Benefits`, which the shared loader reads as the FLAT list —
it synced 0 cover blocks until the sheet was relabelled. `Features & Benefits`
(flat) and `DS Feature Groups` (grouped) are different rows on purpose.

A `series`-scope line can add two more inputs:

| input | feeds |
|---|---|
| `ds_specs_gid` → `[For DS] Technical Specifications` | curated comparison table (`loadSeriesSpecs`) |
| `series_*.png` in DS Images | hero, cover shot, architecture diagram, HW pages (`syncSeriesImages`) |

Broadband needs neither — it builds its table from per-model specs and uses
per-model imagery.

Sync writes it whenever the line sets `ds_overview_gid`, **regardless of
scope** — per-model datasheets consume it too.

Series output is `/preview/series/[line]` → `POST /api/generate-pdf?line=`.
Its version state is `line_datasheets.current_version` + `version_history`,
**separate from the per-model `versions` table**, so a `both` line runs two
numbering streams (EOC's series continues v1.5; each model starts at v1.0).
Drive reuses the per-model helpers with `"Series"` as the model token.

### Writing a dual-scope layout

Broadband EOC renders both scopes from ONE component
(`broadband-preview.tsx`, `scope: "model" | "series"`) off the same
`line_datasheets` rows, so the two PDFs can't drift. But **make the scopes
say different things** — the first cut was near-indistinguishable:

| | series | per-model |
|---|---|---|
| cover | line headline + the shared marketing blocks | THIS model's headline, number, overview and own product shot |
| next page | the generic Features & Benefits list | the model's own features (they carry real numbers where the line-level list is generic), then the deployment diagram |

Keep series *positioning* ("why this family") in the series sheet only —
on a per-model sheet it changes the subject mid-document.

The series route dispatches on category, so a new series line is a component
plus one entry there — content loading, generation and versioning are shared.

## 6. Verifying your work

- **`(print)/preview/*` can be fetched headlessly** with the
  `x-vercel-protection-bypass` header — print it with Puppeteer and read the
  PDF to check layout for real.
- **`(main)` pages (dashboard, product detail) cannot** — the bypass only
  clears the proxy; the whitelist gate in `(main)/layout.tsx` still 307s to
  `/auth/no-access`. Push a branch preview and have a signed-in human click
  through (pitfall #62).
- Always regression-check an untouched line (e.g. ECW536, SFP3510) when you
  change shared sync/preview code.

## 7. Live lines beyond Cloud

| Solution ▸ Line | Models | Notes |
|---|---|---|
| **Accessories ▸ Transceiver** | 13 SFP/QSFP/DAC | green, no hardware page, Contact-Us QR |
| **Edge AI Box ▸ Orin Box** | 6 (E5-NA08…NB16W) | teal SERIES datasheet, `ds_scope='series'`; `series_*` images pending |
| **Data Center ▸ Edge Network Appliance** | SE110, SE210 | navy variant |
| **Data Center ▸ AI Server** | S41, S21, S11 | navy variant; S21/S11 images pending |
| **Broadband Outdoor ▸ Broadband EOC** | EOC655/-C18/-C23, EOC600/610/620 | steel variant, `ds_scope='both'`; images pending |
