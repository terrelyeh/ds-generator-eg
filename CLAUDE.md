# CLAUDE.md — Project Context

> Last updated: 2026-04-14

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
    (print)/
      preview/[model]/page.tsx        # Datasheet HTML preview (?lang=ja&mode=full&toolbar=false)
    api/
      sync/route.ts                   # Google Sheets → Supabase sync
      generate-pdf/route.ts           # Puppeteer PDF + generation lock (GET: check lock, POST: generate)
      upload-image/route.ts           # Upload to Supabase + Google Drive
      translate/route.ts              # AI translation endpoint (multi-provider)
      ask/route.ts                    # RAG query (GET: personas, POST: question + history → answer)
      documents/route.ts              # RAG document index management (GET/POST/DELETE)
      chat-sessions/route.ts          # Conversation persistence (GET/POST/DELETE)
      personas/route.ts               # Persona CRUD
      settings/route.ts               # API key CRUD (with optimistic locking)
      settings/providers/route.ts     # Which AI providers have keys configured
      settings/typography/route.ts    # Typography settings (with optimistic locking)
      settings/fonts/route.ts         # Custom Google Font management per locale
      glossary/route.ts               # Translation glossary CRUD (with optimistic locking)
  components/
    layout/navbar.tsx, solution-sidebar.tsx  # Navbar: Ask, Knowledge, Settings links
    ask/ask-chat.tsx                    # Chat UI + sidebar history + persona + model dropdown
    knowledge/knowledge-base.tsx        # Index dashboard + per-source management
    dashboard/dashboard-content.tsx     # Tabs + Lang column + Translations link
    product/product-detail.tsx          # Detail/Translations tabs, 🌐 menu, version history
    preview/print-toolbar.tsx           # Locale badge (hidden via ?toolbar=false in typography preview)
    settings/
      settings-page.tsx                 # Navigation hub (4 cards)
      personas-editor.tsx               # Persona prompt CRUD
      api-keys-editor.tsx, glossary-editor.tsx, typography-editor.tsx
    compare/compare-table.tsx
  lib/
    rag/
      embeddings.ts                    # OpenAI embedding wrapper + contentHash + estimateTokens
      ingest-products.ts               # Products → 2 chunks (overview + specs) → embed → DB
      personas.ts                      # Persona (Dim1) + UserProfile (Dim2) + CRUD
    google/drive-versions.ts           # detectLatestVersion() + getLocaleSuffix()
    translate/                         # 5-layer prompt + multi-provider translation
      providers/claude.ts, openai.ts, gemini.ts
    datasheet/
      typography.ts                    # TypographySettings, defaults, FONT_OPTIONS
    settings.ts                        # getApiKey(): DB first, env var fallback
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

### Image 雙向同步

```
Google Drive DS Images/ ──(Sync)──→ Supabase Storage
                                        ↑
Product Page 手動上傳 ──→ Supabase Storage + Google Drive DS Images/
```

- 上傳時自動重新命名：`{Model}_{type}.{ext}` / `{Model}_{Band}_{Plane}.{ext}`
- 支援 product、hardware、radio_pattern 三種類型
- Drive 上傳失敗不影響 Supabase（non-blocking）

### PDF Generation

- **Regenerate**（預設）：覆蓋當前版本 PDF，更新 versions 表同一筆記錄
- **New Version**：minor +1（1.4→1.5），新建 versions 記錄
- 前置條件檢查：Product Image + Hardware Image + Overview + Features 都齊全才能 Generate
- Preview toolbar 和 Model page 都有相同的 Regenerate/New Version 選項
- 版本偵測支援三層結構（Camera 用）：`DS_Cloud_ECC100/DS_Cloud_ECC100_v1.1/xxx.pdf`
- **多語言 PDF**：`/api/generate-pdf?model=X&lang=ja&mode=new`，每語言獨立版本號

### Multi-Language Datasheet

完整規則詳見 [`/docs/drive-folder-and-naming-rules.html#s9`](public/docs/drive-folder-and-naming-rules.html)。

**架構要點**：
- 翻譯分兩層：per-product（`product_translations`：headline/subtitle/overview/features/HW image/QR）+ per-product-line（`spec_label_translations`：spec labels 共用）
- 兩種模式：**Light**（只翻標題+內容）vs **Full**（+規格表 label）
- **Draft / Confirmed 流程**：Enable → 翻譯 → Preview（auto-save but stays Draft）→ Save & Confirm → Generate PDF
- 版本獨立：`products.current_versions` JSONB 存各語言版本（`{"en":"1.1","ja":"1.0"}`）
- Drive 資料夾：`DS_Cloud_ECC100_ja/`、`DS_Cloud_ECC100_zh/`（zh-TW → zh 映射在 `getLocaleSuffix()`）
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

完整架構詳見 [`docs/rag-system.md`](docs/rag-system.md)（需更新以反映以下變動）。

### UX 架構（2026-04-14 大改版）
- **Slide Panel**：Navbar Ask 按鈕 → 右側 panel 滑出（600px / 42vw），不離開當前頁面
- **SSE Streaming**：`/api/ask` POST 回傳 `text/event-stream`，逐字輸出。三家 LLM 都用 streaming（streamClaude/streamOpenAI/streamGemini）
- **Inline Citations**：LLM 回答用 `[1]` `[2]` 標記，前端 `CitationTooltip` hover 顯示來源 + 圖片縮圖。外部來源（gitbook/helpcenter）可點擊跳轉原文
- **UI Path Styling**：`**Configure > Gateway > VPN**` 自動渲染為 breadcrumb pill 樣式
- **Welcome Screen**：可自訂（`app_settings`: `ask_welcome_subtitle`, `ask_welcome_description`, `ask_example_questions`），Settings > Ask Welcome 有 UI
- **AI Avatar**：每則回覆左側有 network-node icon

### Persona & Profile（精簡版）
- **3 Personas**：Product Specialist（預設）、Sales Assistant、Technical Support
- **4 Profiles**：同事（預設，帶基本白話解釋）、業務/Channel、產品經理、終端客戶
- **核心原則**：禁止客套開場白、Feature-Benefit 原則、站在對方立場、寧多勿少
- Persona prompt 在 `personas.ts` 的 `DEFAULT_PERSONAS`；Profile 在 `USER_PROFILES`

### 知識庫 Source Types（2026-04-14）
| Type | Pipeline | 已索引 | 備註 |
|---|---|---|---|
| `product_spec` | `ingest-products.ts` | 66 products | 從 Supabase DB 建 chunk |
| `gitbook` | `ingest-gitbook.ts` | 4 spaces (~900 chunks) | sitemap → fetch → chunk。有 `/ingest-gitbook` Skill |
| `helpcenter` | `ingest-helpcenter.ts` | 41 articles (~235 chunks) | Intercom SPA，用 `KNOWN_ARTICLES` fallback。有 `/ingest-helpcenter` Skill |
| `google_doc` | `ingest-google-doc.ts` | 1 doc (70 chunks) | Drive API / export → tab split → chunk。UI 支援 Add Doc |

**核心流程**：問題(+history) → Embed → pgvector 搜尋(top 12) → 組裝 prompt(Persona+Profile+Context with source_type labels) → SSE Stream LLM → 回答+citations+follow-ups
**資料表**：`documents`（向量索引，chunk-level image_urls in metadata）、`chat_sessions`（對話持久化）

## Current Status

功能清單詳見 [README.md](README.md)。

### 🔜 Next Steps

**RAG**：
1. **Text Snippet CRUD** — 手動文字片段（FAQ、競品比較）
2. **Auto re-index after Sync** — Sync 完成後自動觸發 re-embed
3. **QSG 批次 Vision** — 100+ model 的 LED table 截圖轉文字
4. **更新 `docs/rag-system.md`** — 反映 SSE/citations/panel/source types 變動

**Datasheet 系統**：
5. **多國語言擴展到其他產品線** — 需為 AP/Switch/NVS/VPN FW 建立 product-line prompt
6. **翻譯 feedback 偵測** — Save 時偵測使用者修改，建議加入詞庫
7. **多張 Hardware 圖支援** — front/rear/bottom 最多 3 張

**系統**：
8. **Supabase Auth + email 白名單** — 控制存取權限
9. **Smart Image Sync** — 已實作 Drive modifiedTime 比對，但需觀察 production 穩定性

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
16. **Cloud Switch spec 不解析** — Sheet 的 Detail Specs 沒有標準 category header，parser 需要 fallback "General" category。已修
17. **Gitbook HTML→text 噪音** — Gitbook chatbot widget、banner、SVG icon alt text "hashtag" 會汙染 chunk。htmlToText 已加清理
18. **Gitbook 圖片 URL** — proxy URL（`/~gitbook/image?url=...&sign=...`）server-side fetch 會 400。需提取原始 `files.gitbook.io` URL，且保持 `%2F` encoding 不被 double-decode
19. **Google Doc export=txt 無 heading** — plain text export 丟失 markdown 結構，需用 numbered section pattern (`\d+\.\s+[A-Z]`) 作為 chunk 分割點
20. **Flex scroll 需要每層 min-h-0** — 巢狀 flex 容器的每一層都需要 `min-h-0` 才能讓子元素 `overflow-y-auto` 生效
21. **Smart image sync** — `syncProductImages` 比對 Drive `modifiedTime` vs Storage `last-modified`，Drive 更新才重新下載
