# Database Schema — Product SpecHub

Supabase project `xzolvtlqafwkxfuaryec`，與 **EnGenie** 共用。
Migrations 一律放 `packages/db/supabase/migrations/`（唯一來源）。

## 關係圖

```
solutions → product_lines → products → spec_sections → spec_items
                             products → image_assets, change_logs, versions
             product_lines → comparisons, cloud_comparisons, revision_logs
             product_lines → line_datasheets        (線層共用 datasheet 內容)
auth.users → profiles ← email_whitelist.invited_by
```

## 擁有權（跨 app）

| | Tables |
|---|---|
| **本 app 擁有 schema 演進權** | products、product_lines、line_datasheets、versions、product_translations、spec_label_translations、translation_glossary、profiles、email_whitelist、app_settings |
| **EnGenie 擁有** | documents、ask_workspaces、api_keys、chat_sessions、topology_icons |
| **共同** | `solutions` — 本 app 管產品 solution；engenie 只加 `kind='knowledge'` 列 |

⚠️ 改 products / product_lines schema 前，確認 EnGenie 的
ingest-products / taxonomy 不受影響。

## Key tables

### solutions
id, name, slug, label, color_primary, ds_template, sort_order, **kind**
（`'product'` | `'knowledge'`）。

**dashboard sidebar 只顯示 `kind='product'`**；沒有 product line 的 solution 以灰階
disabled「soon」佔位呈現（2026-06-16 起不再用 `product_line_count>0` 過濾掉），
**且排在有產品線的 solution 之後**（排序在元件內推導，見 CLAUDE.md UI conventions）。

### product_lines
solution_id (FK), ds_prefix, ds_images_folder_id, drive_folder_id, sort_order,
**spec_footnote** + **spec_footnote_translations** (JSONB)。

- **`qr_url_template`** — NULL = 用 dict default；`{model}` 替換 lowercase model_name。
  Cloud AP / Camera 維持短連結 `qr.engenius.ai/qsg/<model>`；
  VPN FW / NVS / Switch / L3 Switch / Extender 用 doc.engenius.ai 結構。
  Resolution priority：`product_translations.qr_url` → `qr_url_template` →
  `dict.defaultQrUrl`。
- **`ds_scope`** — `'model'`（預設）| `'series'` | `'both'`，決定這條線出哪幾種
  datasheet。CHECK constraint 在 migration `00032`。
- **`ds_overview_gid`** / **`ds_specs_gid`** — 線層 datasheet 內容的來源 tab。

### line_datasheets（migration `00029` + `00032`）
線層共用 datasheet 內容，**per-model 與 series 兩種 scope 讀同一列**，所以兩份 PDF
不會漂移。headline, series_name, category_label, overview, **features**（封面分組
區塊）, **benefits**（平清單）, software_arch, footnote, specs（人工整理的比較表）,
images（`series_*` 圖）。

版本狀態也在這裡：**`current_version` + `version_history`**，
**與 per-model 的 `versions` 表分開** → `ds_scope='both'` 的線跑兩條版號流。

### products
status, current_version, **current_versions** (JSONB: `{"en":"1.1","ja":"1.0"}`)、
**ds_features** (JSONB `[{title, bullets[]}]`，選填的分組行銷文案)、
product_image / hardware_image / **hardware_image_2**。

⚠️ 三個 image 欄位是 **`NOT NULL DEFAULT ''`** —— 要清空寫 `""` 不是 `null`
（pitfall #60）。**空字串 = 從沒填過**，不是「被清掉」。

### versions
version, **locale**, pdf_storage_path, changes。
**UNIQUE (product_id, version, locale)** —— 漏 locale 會 silent fail（pitfall #45）。

### product_translations
per-product per-locale：headline, **subtitle**, overview, features,
hardware_image（此欄 nullable，清空用 `null` 才對）, qr_label, qr_url,
translation_mode, **confirmed**。

### 其他
- `spec_label_translations` — per-line per-locale label 翻譯；
  `translation_glossary` — 詞庫
- `app_settings` — key-value：API keys（LLM）、`typography_${locale}`、
  `custom_fonts_${locale}`、`pdf_lock_{model}_{lang}`、`pdf_lock_series_{line}_en`
  （**與 EnGenie 共用**；keys 管理 UI 在 EnGenie）
- `profiles` — role TEXT CHECK (admin/editor/pm/viewer)；
  `email_whitelist` — 邀請制白名單

## Battlecard（內部競品比較，Cloud AP MVP，migration `00025`）

```
competitors (品牌) → competitor_products (型號, FK product_line + datasheet_url)
competitor_matchups (anchor_model_name × competitor_product_id × tier)
battlecard_dimensions (per-line 比較維度模板 = 表格的列)
battlecard_values (每格值)
```

- **tier 是「關係層」** —— 同一競品對不同自家機型可以是不同 tier
- `battlecard_values` 有兩個 nullable FK（`anchor_model_name` | `competitor_product_id`）
  \+ CHECK 互斥 + partial unique index；帶 **confirmed** + source_url + captured_at +
  extraction_method
- **RLS：authenticated 唯讀，寫入一律走 admin client**

細節見 [`battlecard.md`](battlecard.md)。

## 慣例

- Supabase query builders 是 **PromiseLike 但不是完整 Promise** → 要用
  `as { data: T | null }`
- **所有 write 都要檢查 `error`** —— supabase-js 不 throw，回 `{ data, error }`。
  用 `throwIfDbError(label)(res)`（pitfall #45，這個系統最久的雷）
- 新表要手動加進 `packages/db/src/types/database.generated.ts`
