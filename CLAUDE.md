# CLAUDE.md — Project Context

> Last updated: 2026-04-22 (datasheet layout system session)

## Project Overview

**Product SpecHub** — EnGenius 產品規格管理與 Datasheet 自動化系統。
從 Google Sheets 同步產品資料到 Supabase，前端提供 Dashboard 管理、
Spec Comparison、Change Log，並能生成 PDF Datasheet。

**7 個產品線**（全屬 EnGenius Cloud solution）：Cloud AP, Cloud Switch,
Cloud Camera, Cloud AI-NVS, Cloud VPN Firewall, Switch Extender, Unmanaged Switch。

架構已支援**多 Solution 擴展**（Fit, Broadband, DataCenter 等），
`solutions` 表 + `/dashboard/[solution]` 路由已就位，sidebar 已有 7 個 Solution 佔位。

功能清單與產品定位詳見 [README.md](README.md)。

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **UI**: Tailwind CSS v4 + shadcn/ui
- **Table**: @tanstack/react-table（用於 Compare 頁面）
- **Backend**: Supabase (Postgres + Storage + Auth)
- **Deployment**: Vercel + Vercel Cron
- **Data Source**: Google Sheets API + Google Drive API → synced to Supabase
- **Notifications**: Telegram Bot API
- **PDF**: Puppeteer (server-side) + browser print (client-side)
- **RAG**: pgvector + OpenAI Embedding (`text-embedding-3-small`) + multi-LLM (Claude/GPT/Gemini)
- **Markdown**: react-markdown + remark-gfm（Ask 頁面回答渲染）

## Next.js 16 Breaking Changes (IMPORTANT)

- `params` and `searchParams` are **Promises** — must be awaited
- `cookies()` and `headers()` are **async** — must be awaited
- Fetch requests are **not cached by default**
- Server Components are the default; use `'use client'` for state/hooks/events

## Directory Structure

```
src/
  app/
    (main)/
      dashboard/[solution]/page.tsx    # Per-solution dashboard (reads ?line= for tab)
      compare/[line]/page.tsx
      changelog/[line]/page.tsx
      product/[model]/page.tsx         # Product detail (sticky header, tabs: Detail/Translations)
      translations/[line]/page.tsx     # Per-product-line spec label translations
      ask/page.tsx                    # Ask SpecHub — RAG chat UI
      knowledge/page.tsx              # Knowledge Base — index management dashboard
      settings/page.tsx               # Settings navigation hub (4 cards)
      settings/api-keys/page.tsx      # API key management
      settings/glossary/page.tsx      # Translation glossary management
      settings/typography/page.tsx    # Font + size/weight per locale (split layout with live preview)
      settings/personas/page.tsx      # Ask Persona prompt management
      wifi-regulation/[code]/page.tsx  # Per-country WiFi regulation markdown viewer
    (print)/
      preview/[model]/page.tsx        # Datasheet HTML preview (?lang=ja&mode=full&toolbar=false)
    api/
      sync/route.ts                   # Sheets → Supabase sync + auto re-index products
      ask/route.ts                    # RAG SSE stream + taxonomy/model/country re-rank
      documents/route.ts              # RAG index mgmt (GET/POST/PATCH/DELETE, paginates via range())
      taxonomy/route.ts               # Returns solutions + product_lines + products for dropdowns
      generate-pdf/route.ts           # Puppeteer PDF + generation lock
      upload-image/route.ts           # Upload to Supabase + Google Drive
      translate/route.ts              # AI translation endpoint (multi-provider)
      chat-sessions/route.ts          # Conversation persistence
      personas/route.ts               # Persona CRUD
      settings/route.ts               # API key CRUD (optimistic locking)
      settings/{providers,typography,fonts}/route.ts
      glossary/route.ts               # Translation glossary CRUD
      products/[model]/layout-ack/route.ts  # Per-locale layout overflow ack (hash-bound)
  components/
    layout/navbar.tsx, solution-sidebar.tsx
    ask/ask-chat.tsx                    # Chat UI + citations (http external OR /wifi-regulation/* internal)
    knowledge/
      knowledge-base.tsx                # Source cards + per-row Sync/Edit, TaxonomyBadges
      taxonomy-picker.tsx               # Cascading Solution > Product Line > Model multi-select
    dashboard/dashboard-content.tsx     # Tabs + Lang column + Translations link
    product/product-detail.tsx
    preview/print-toolbar.tsx
    settings/{settings-page,personas-editor,api-keys-editor,glossary-editor,typography-editor}.tsx
    compare/compare-table.tsx
  lib/
    rag/
      embeddings.ts                    # OpenAI embedding + contentHash + estimateTokens
      taxonomy.ts                      # TaxonomyMeta types + matchesTaxonomyFilter (inheritance rule)
      vision.ts                        # Gemini Vision — full-table extraction, 2000 max tokens
      ingest-products.ts               # Auto-derives taxonomy from product_lines.solution_id FK
      ingest-gitbook.ts                # Main chunks + focused LED chunks (chunk_index ≥ 10000)
      ingest-helpcenter.ts, ingest-google-doc.ts
      ingest-wifi-regulations.ts       # WiFi RegHub API → per-country chunk, source_id = ISO code
      personas.ts                      # Persona + UserProfile
    google/
      auth.ts, drive-versions.ts, drive-images.ts
      docs.ts                          # Service Account first → public export URL fallback
      sheets.ts                        # cellToCleanValue (strikethrough filter) + pattern-based category detection
    datasheet/
      cover-layout.ts                  # Dynamic features/overview sizing + per-locale CJK metrics
      pagination.ts                    # Spec 2-col/multi-page split + mid-item (cont.) header
      layout-check.ts                  # Overflow heuristic (cover + spec), locale-aware
      layout-ack.ts                    # computeContentHash / isAckValid — hash-bound ack
      typography.ts
    translate/
    settings.ts                        # getApiKey() + API_KEY_MAP (wifi_reghub_api_key lives here)
  types/database.ts
```

## Architecture & Data Flow

完整的同步機制、變更偵測、Telegram 通知流程詳見 [`docs/sync-and-notifications.md`](docs/sync-and-notifications.md)。

### Google Sheets → Supabase Sync

每個產品線有一個 Google Sheet，包含 Web Overview、Detail Specs、Comparison、Revision Log 頁籤。

**Web Overview 重要欄位**：
- `Model Name` → `products.full_name`
- `Model Number` → `products.model_name` (primary key)
- `Status` → `products.status`（Active / Upcoming / Pending）
- `Single Overview` → `products.overview`
- `Key Feature Lists` → `products.features` (JSON array, 自動 strip bullet 前綴)

### Product Status

| Sheet 值 | DB 值 | Dashboard |
|---|---|---|
| 留空 / Active | `active` | 正常顯示 |
| Upcoming | `upcoming` | 琥珀色 badge |
| Pending | `pending` | 紅色 badge（暫不發布，統一狀態） |

Dashboard 預設只顯示 Active，有 Active/All toggle。

### Sync 機制

- Vercel Cron 每天 01:00 UTC (09:00 Taiwan) → `POST /api/sync`
- Smart Sync：Drive `modifiedTime` vs `product_lines.last_synced_at`
- Dashboard Sync 按鈕只同步**當前 tab 的產品線**（`?force=true&line=Cloud+Camera`）
- Deep diff 含 status 欄位 — status-only 變更也會觸發 upsert
- **圖片同步**：即使內容無變更，若 product_image 或 hardware_image 缺失仍會從 Drive 拉取
- `sheet_last_editor` fallback 到 Drive API `displayName`（Service Account 看不到 email）
- **Auto re-index after sync**：sync 完成後，對 `allChanges` 中的每個 `product_name` 呼叫 `ingestProducts({ modelName })`，自動更新 RAG 向量。`content_hash` 去重確保未變更的 chunks 被 skip。失敗隔離不中斷 sync 回應，`response.reindex` 顯示 `{processed, skipped, errors}`

### Image 雙向同步 (locale-aware)

```
Drive 真源 (authoritative)          Supabase (快取)          前端
─────────────────────────            ────────────           ─────
Cloud AP/DS Images/    ──(sync)──▶  images/<model>/...  ──▶  products.product_image
                       ──(sync)──▶                      ──▶  products.hardware_image
Cloud AP_ja/DS Images/ ──(sync)──▶  images/<model>/..._ja ▶  product_translations.hardware_image (locale=ja)
Cloud AP_zh/DS Images/ ──(sync)──▶  images/<model>/..._zh ▶  product_translations.hardware_image (locale=zh-TW)

MKT web upload (任一語言) ──write-through──▶ Supabase + 對應語言的 Drive DS Images
```

- **檔名**：英文 `{Model}_{type}.{ext}`；語言版 `{Model}_hardware_{locale}.{ext}`（只有 hardware 有語言變體；product 圖和 Radio Pattern 跨語言共用）
- **Drive 資料夾**：每個 product line 有對應的 `<lineName>_<locale>` 兄弟資料夾。語言版的 `DS Images/` 子資料夾如果缺失，`resolveLocaleDsImagesFolder()` 會自動建立。語言版的 product line 資料夾必須 PM 事先建好（`Cloud AP_ja`），不會自動建
- **寫入路徑**：`/api/upload-image` 收到 locale 參數 → `resolveLocaleDsImagesFolder` walk up EN 資料夾 → Model Datasheet root → 找 `<line>_<locale>` → 找 / 建 `DS Images/` 子資料夾 → 上傳
- **同步路徑**：`syncLocalizedHardwareImage()` 在 sync cron 針對每個啟用的 locale 各跑一次，寫入 `product_translations.hardware_image`
- **Locale 代碼**：`ja` 和 `zh`（zh-TW 簡寫），統一用 ISO 639-1 語言代碼。舊的 `_jp` / `_JP` 已在 2026-04-15 透過 `scripts/rename-jp-to-ja.mjs` 全面改名
- Drive 上傳失敗不影響 Supabase（non-blocking）

### PDF Generation

- **Regenerate**（預設）：覆蓋當前版本 PDF，更新 versions 表同一筆記錄
- **New Version**：minor +1（1.4→1.5），新建 versions 記錄
- 前置條件檢查：Product Image + Hardware Image + Overview + Features 都齊全才能 Generate
- Preview toolbar 和 Model page 都有相同的 Regenerate/New Version 選項
- 版本偵測支援三層結構（Camera 用）：`DS_Cloud_ECC100/DS_Cloud_ECC100_v1.1/xxx.pdf`
- **多語言 PDF**：`/api/generate-pdf?model=X&lang=ja&mode=new`，每語言獨立版本號

### Datasheet Layout System（`lib/datasheet/`）

Cover page 用 **動態版面**：features 依內容高度浮動（max 320pt），overview 吃剩下空間。Spec 自動 2 欄分頁 + 跨欄 mid-item split。所有估算 **locale-aware** — CJK metrics 不同於 EN。

- **`cover-layout.ts`** — `estimateCoverLayout()` + `balanceFeatureColumns()`（貪婪按高度分欄，不按 item 數）。`LOCALE_METRICS` 表保存每 locale 的 `overviewCharsPerLine` / `featureCharsPerLine` / `overviewLineHeightPt` / `featureLineHeightPt` / `itemMarginPt` / `coverGapPt`。**features 字比 overview 小**（EN 10/11pt, JA 10.5/11.5pt, zh 11/12pt），兩個 line-height 必須分開估算。CJK 把 `coverGapPt` 從 20pt 降到 10pt 買回空間
- **`pagination.ts`** — spec 分頁；`SPEC_BASE_ROW_HEIGHT=20, SPEC_LINE_EXTRA=10, BOTTOM_MARGIN=72`。`fitSection(allowForceFit)` 只有空欄才能 force-fit（避免把尾巴 orphan 到新頁）。跨欄/跨頁用 `isContinuation` flag，renderer skip 重複 category header（不是拼 "(cont.)" 字串）
- **`layout-check.ts`** — 二元綠/紅燈（丟掉 amber）。`checkProductLayout({ overview, features, spec_sections, locale })` 接 locale 選擇 metrics。只有真正會跑版才紅燈
- **`layout-ack.ts`** — `products.layout_ack` JSONB，格式 `{ en: { acked: true, hash: "..." }, ja: ... }`。`computeContentHash(overview, features)` 產 16-char sha256；`isAckValid(ack, currentHash)` 比對。內容一改 hash mismatch → ack 自動失效，紅燈回來。Legacy `true` 向後相容（永遠視為有效）
- **Layout warning UI**（`components/product/product-detail.tsx`）：`LayoutWarningBanner` 顯示 overflow + "Mark as Reviewed OK"；ack valid 時改顯示 `LayoutAckedNotice` 綠色細條 + Undo 按鈕。每 locale 獨立 banner
- **空翻譯不檢查**：dashboard + product detail 在跑 per-locale layout check 前，先看 `t.overview` 和 `t.features` 是否都是 null/空。都空就 skip — 否則 EN fallback 內容被 CJK metrics 量到會假性紅燈

### Multi-Language Datasheet

完整規則詳見 [`/docs/drive-folder-and-naming-rules.html#s9`](public/docs/drive-folder-and-naming-rules.html)。

**架構要點**：
- 翻譯分兩層：per-product（`product_translations`：headline/subtitle/overview/features/HW image/QR）+ per-product-line（`spec_label_translations`：spec labels 共用）
- 兩種模式：**Light**（只翻標題+內容）vs **Full**（+規格表 label）
- **Draft / Confirmed 流程**：Enable → 翻譯 → Preview（auto-save but stays Draft）→ Save & Confirm → Generate PDF
- 版本獨立：`products.current_versions` JSONB 存各語言版本（`{"en":"1.1","ja":"1.0"}`）
- Drive 資料夾：PDF 在 `<lineName>_<locale>/DS_Cloud_<model>_<locale>/`，圖片在 `<lineName>_<locale>/DS Images/{model}_hardware_<locale>.ext`（`getLocaleSuffix()` 負責 zh-TW → zh 映射；日文統一用 `ja`，舊的 `_jp` 命名已於 2026-04-15 全部改掉）
- Headline 支援 `**粗體**` markdown → 渲染為 `<strong>`（`parseHeadlineMarkup()` in preview）
- CJK 排版：shared base（禁則處理+justify）+ per-locale CSS 動態從 DB 讀取（`typography_${lang}` in `app_settings`）
- **Typography Settings**（`/settings/typography`）：字型選擇（Google Fonts）+ 字級/字重/顏色 per-locale，split layout 左設定右 preview
- 自定義 Google Font：貼 URL 自動解析（`parseGoogleFontUrl()`），存 `app_settings` as `custom_fonts_${locale}`

**AI 翻譯系統**：
- 5 層 Prompt：base → locale → product-line → content-type → glossary（from DB）
- 多 provider：Claude Sonnet/Opus、GPT-4o、Gemini 2.5 Pro
- API Key 優先順序：`app_settings` DB 表 > env var
- 回傳 JSON `{ translated, notes }` — notes 用繁中說明做了什麼優化
- `translation_glossary` 表存公司詞庫，scope 分 global 和 per-product-line
- 新增產品線 prompt：在 `src/lib/translate/prompts/product-lines/` 加檔案 + 在 `index.ts` 的 `productLinePrompts` 註冊


## Brand & Visual System

- Primary Blue: `#03a9f4` → `text-engenius-blue`, `bg-engenius-blue`
- Dark Text: `#231f20` → `text-engenius-dark`
- Gray Text: `#6f6f6f` → `text-engenius-gray`
- NO pure black `#000000`
- **Heading font**: Plus Jakarta Sans (`font-heading`)，用於 Navbar 品牌標題
- **Body font**: Geist Sans（`font-sans`）

## Database Tables

```
solutions → product_lines → products → spec_sections → spec_items
                             products → image_assets, change_logs, versions
             product_lines → comparisons, cloud_comparisons, revision_logs
auth.users → profiles
```

Key tables:
- `solutions` — id, name, slug, label, color_primary, ds_template, sort_order
- `product_lines` — solution_id (FK), ds_prefix, ds_images_folder_id, drive_folder_id, sort_order
- `products` — status, current_version, **current_versions** (JSONB: `{"en":"1.1","ja":"1.0"}`)
- `versions` — version, **locale**, pdf_storage_path, changes, generated_at
- `change_logs` — per-product content diff history
- `image_assets` — radio_pattern 多張圖
- `product_translations` — per-product per-locale: headline, **subtitle**, overview, features, hardware_image, qr_label, qr_url, translation_mode, **confirmed**
- `spec_label_translations` — per-product-line per-locale: original_label → translated_label, label_type (spec/section)
- `translation_glossary` — english_term, locale, translated_term, scope (global/product-line), source (manual/feedback)
- `app_settings` — key-value store: API keys, `typography_${locale}`, `custom_fonts_${locale}`, `persona_{id}`, `pdf_lock_{model}_{lang}`
- `documents` — RAG 向量索引：source_type, content, embedding VECTOR(1536), metadata JSONB, content_hash
- `chat_sessions` — 對話持久化：user_id (default 'anonymous'), title, persona, provider, messages JSONB

## Conventions

- Supabase query builders 是 **PromiseLike** 但不是完整 Promise → 要用 `as { data: T | null }`
- PDF preview 用 inline `<style>` + absolute positioning 排版，不用 Tailwind
- Loading states 用 `loading.tsx` skeleton pattern
- Drive 資料夾結構與命名規則詳見 [`docs/drive-folder-and-naming-rules.md`](docs/drive-folder-and-naming-rules.md)

### UI Layout Conventions

- **Dashboard 兩行 toolbar**: Row 1 = product line tabs；Row 2 = Active toggle | Compare Changelog **Translations** | Sync + **Lang column** 顯示已啟用語言 badges
- **Product page sticky header**: `sticky top-14 z-20` — model name + version badge + buttons 固定
- **Breadcrumb**: 簡化為 `[ProductLine] / [Model]`，ProductLine 連結帶 `?line=` 回正確 tab
- **Dashboard 表格欄位**: #, Model#, Model Name, Version, **Lang**, Last Changed, OV, FT, Prod, HW, [Radio Pattern], Actions
- **Solution sidebar**: 預設收合（`collapsed: true`），只顯示 icon
- **Datasheet 佈景**: Cloud = 藍色 `#03a9f4`，Unmanaged = 灰色 `#58595B`（由 `product_lines.category` 判斷）

## Ask SpecHub (RAG System)

Full context moved to [`docs/rag-context.md`](docs/rag-context.md) —
read it when working on Ask / RAG / knowledge base features. Quick
pointers so you know it exists:

- **UX**: Navbar Ask → right-side slide panel; SSE streaming from
  `/api/ask`; inline `[1]` citations with `CitationTooltip`
- **Knowledge sources**: 5 pipelines under `src/lib/rag/ingest-*` →
  `documents` table (pgvector); taxonomy meta on every chunk
- **Cross-lingual re-rank**: `/api/ask/route.ts` supplements embedding
  results with literal model/country lookups to compensate for
  `text-embedding-3-small` weakness on CJK query → EN chunk matching
- **3 Personas × 4 User Profiles** configurable in Settings

## Current Status

功能清單詳見 [README.md](README.md)。

### 🔜 Next Steps

**RAG**：
1. **Text Snippet CRUD** — 手動文字片段（FAQ、競品比較）
2. **更新 `docs/rag-system.md`** — 反映 SSE/citations/taxonomy/wifi_regulation 變動
3. **回頭補 gitbook / helpcenter 的 taxonomy tag**（目前都是 null，透過 Edit Taxonomy dialog backfill）

**Datasheet 系統**：
4. **多國語言擴展到其他產品線** — 需為 AP/Switch/NVS/VPN FW 建立 product-line prompt
5. **翻譯 feedback 偵測** — Save 時偵測使用者修改，建議加入詞庫
6. **多張 Hardware 圖支援** — front/rear/bottom 最多 3 張

**系統**：
7. **Supabase Auth + email 白名單** — 控制存取權限
8. **Smart Image Sync** — 已實作 Drive modifiedTime 比對，需觀察 production 穩定性

## Deployment

```bash
npm run dev    # Local dev server (port 3000)
npm run build  # Production build
npm run lint   # ESLint check
```

- Vercel 自動部署 main branch
- Vercel Cron: `vercel.json` → `"0 1 * * *"` (每天 09:00 台灣時間)
- 需要的 env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `CRON_SECRET`
- AI 翻譯 env vars（可選，也可在 Settings 頁面設定）：`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`

## Common Pitfalls

1. **Google Sheets UNFORMATTED_VALUE 回傳 Excel serial number** — 日期欄位會是 5 位數字（如 45512），需轉換。`parseRevisionDate` 先檢查 8/6 位 compact 格式，最後才檢查 serial number（限定 5 位 + 30000-60000 範圍）
2. **Shared Drive 需要 `supportsAllDrives: true`** — Drive API `files.get` 不加這個參數會 404
3. **Telegram 訊息 4096 字元上限** — 同步多產品時超長訊息要截斷到 4000 字
4. **Brave 瀏覽器 PDF 多空白頁** — Brave 的 print engine 有差異，建議用 Chrome 存 PDF。已加 JS `beforeprint` event 用 body height clamping 盡量緩解
5. **Comparison dynamic category detection** — 判斷邏輯：row 所有 model column 完全空白（連 `-` 都沒有）才算 category。`-` 代表 "不適用"，算有值
6. **Web Overview features 格式** — Sheet 裡的 Key Feature Lists 是純換行分隔文字（非 `* ` bullet 格式），parser 需要處理兩種格式。label 欄位本身可能含換行（如 `"Key Feature Lists \n (條列式功能)"`），用 `includes()` 匹配而非 exact match
7. **Compare table 欄位壓縮** — table 必須用 `min-w-max`（非 `w-full`），否則 24+ model 欄位會被壓縮到容器寬度。搭配 `overflow-auto` 讓表格在卡片內橫向滾動
8. **Table sticky header 需要 `overflow-x-clip`** — base Table 元件的容器用 `overflow-x-clip`（非 `overflow-x-auto`），否則 `position: sticky` 無法穿透 scroll container 生效
9. **Supabase 不認得新建的 table** — `product_translations` 等新表的 query 會被 TypeScript 推斷為 `never`。解法：`supabase.from("product_translations" as "products")` + 手動 `as { data: T | null }` 型別斷言
10. **AI 翻譯 JSON 解析** — prompt 要求回 JSON `{ translated, notes }`，但有些 model 會加 markdown code fence。`index.ts` 有 fallback：strip ``` 後 parse，失敗就當 plain text
11. **zh-TW locale 在 Drive 用 zh** — `getLocaleSuffix("zh-TW")` 回傳 `"zh"`，資料夾命名和 PDF 檔名用 `_zh` 不用 `_zh-TW`
12. **Gemini API model 名稱** — 翻譯用 `gemini-2.5-pro`（加 `responseMimeType: "application/json"` 穩定 JSON 輸出）。Ask RAG 用 `gemini-2.5-flash`（預設）或 `gemini-2.5-pro`。注意：`-latest` suffix 已棄用
13. **Preview CSS 動態化** — per-locale 的字級/字重/顏色不再 hardcode 在 CSS，而是從 `app_settings` 讀 `typography_${lang}` JSON，fallback 到 `TYPOGRAPHY_DEFAULTS[lang]`
14. **Gemini 回應解析** — streaming 模式下用 `streamGenerateContent?alt=sse` endpoint，parse SSE events，skip thinking parts
15. **chat_sessions messages 格式** — 存入時直接傳 raw array 給 Supabase JSONB，**不要** `JSON.stringify()`
16. **Spec category detection is pattern-based** — 早期用硬編 whitelist 會漏抓許多 category，現在改成「整列所有 model 欄位皆空（連 `-` 都沒有）」才算 category header。`-` 意思是「不適用」算有值。strikethrough 文字會在 `cellToCleanValue()` 裡被 `textFormatRuns` 過濾掉
17. **Gitbook HTML→text 噪音** — Gitbook chatbot widget、banner、SVG icon alt text "hashtag" 會汙染 chunk。htmlToText 已加清理
18. **Gitbook 圖片 URL** — proxy URL（`/~gitbook/image?url=...&sign=...`）server-side fetch 會 400。需提取原始 `files.gitbook.io` URL，且保持 `%2F` encoding 不被 double-decode
19. **Google Doc export=txt 無 heading** — plain text export 丟失 markdown 結構，需用 numbered section pattern (`\d+\.\s+[A-Z]`) 作為 chunk 分割點
20. **Flex scroll 需要每層 min-h-0** — 巢狀 flex 容器的每一層都需要 `min-h-0` 才能讓子元素 `overflow-y-auto` 生效
21. **Smart image sync** — `syncProductImages` 比對 Drive `modifiedTime` vs Storage `last-modified`，Drive 更新才重新下載
22. **Google Docs markdown export 兩個陷阱** — (a) 標記 escape：`[v1.2]` 變 `\[v1.2\]`，tab-split regex 必須吃 `\\?\[`；(b) 圖片 ref 定義 `[imageN]: <data:image/png;base64,...>` 會把一個空 tab 變成 9MB 內容，`ingest-google-doc.ts` 用 `stripImageRefs()` 過濾
23. **Supabase PostgREST db-max-rows 1000 硬上限** — client 端的 `.limit(50000)` 會被伺服器端 cap 覆蓋，產出**靜默截斷**（不報錯）。需要用 `.range(page*1000, (page+1)*1000-1)` 分頁迴圈抓完整資料集。`/api/documents` GET 就是這樣抓 2987+ rows
24. **Vision API `maxOutputTokens` 預設太小** — 2-4 句描述夠用的預設值（300）會把 12 行 LED table 壓成摘要。`vision.ts` 提到 2000，並在 prompt 裡明確要求 tables 輸出完整 markdown
25. **`text-embedding-3-small` 跨語言 retrieval 偏弱** — 中文 query 抓英文 chunk 時相似度常常低於 threshold。解法是在 `/api/ask/route.ts` 加 literal-match supplementary lookup（model/country regex）+ re-rank，詳見 RAG section
26. **Gitbook vision LED table dilution** — 原本 LED image 描述混在 page 的大 chunk 裡（跟封面、配件、mounting 圖混在一起），embedding 訊號被稀釋。解法：`ingest-gitbook.ts` 偵測 LED table pattern 後額外輸出一個 focused chunk（`chunk_index ≥ 10000`，含 bilingual header），標題乾淨如 `"ECW536 — LED Behavior"`
27. **`CitationTooltip` 連結判斷** — `ask-chat.tsx` 判斷 `source_type !== "product_spec" && (source_url.startsWith("http") || (wifi_regulation && source_url.startsWith("/")))`。新增有內部頁面的 source type 時要更新此條件
28. **Cover layout CJK metrics** — `cover-layout.ts` 的 `LOCALE_METRICS` 必須分開估 `overviewLineHeightPt` 和 `featureLineHeightPt`，因為 features 字比 overview 小（差 1pt）。用同一個 line-height 會 over-allocate features，壓縮 overview 導致假性紅燈。CJK 的 `coverGapPt` 用 10pt（非 20pt）買回空間。改 metrics 後務必用 `scripts/check-locale-layout.ts <model>` 驗證多個 locale
29. **Layout ack 格式** — `products.layout_ack` 目前兩種格式並存：legacy `true`（永遠 valid）和新 `{acked: true, hash: "..."}`（hash-bound）。讀取一律走 `isAckValid(ack, currentHash)` 判斷，別直接 `ack[locale] === true`。Hash 只涵蓋 overview + features（specs 不算，因為 spec overflow 非 per-locale）
30. **空翻譯誤判紅燈** — 啟用 ja 但還沒填 overview/features 時，若 fallback 到 EN 內容 + 用 CJK metrics 量，會假性紅燈。dashboard 和 product detail 兩處都有 `hasAnyTranslation` 守門，未翻譯時完全 skip 該 locale 的 check

## 詳細文件

- [`docs/rag-context.md`](docs/rag-context.md) — Ask SpecHub / RAG 完整架構
- [`docs/sync-and-notifications.md`](docs/sync-and-notifications.md) — Sync 機制 + Telegram 通知流程
- [`public/docs/drive-folder-and-naming-rules.html`](public/docs/drive-folder-and-naming-rules.html) — Drive 資料夾結構、檔名規則、Detail Specs 填寫規則
