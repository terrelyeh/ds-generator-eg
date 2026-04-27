# CLAUDE.md — Project Context

> Last updated: 2026-04-27 (auth system: Google OAuth + RBAC + users management)

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
- **Backend**: Supabase (Postgres + Storage + Auth via Google OAuth)
- **Auth**: `@supabase/ssr` + Google OAuth + DB whitelist + 4-role RBAC
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
      settings/users/page.tsx         # Admin user management (invite + role + remove)
    auth/                             # Public auth flow (no proxy gate)
      sign-in/{page,sign-in-form}.tsx # Google OAuth entry (Suspense-wrapped)
      callback/route.ts               # PKCE code-for-session exchange
      redirecting/page.tsx            # Reads sessionStorage `next`, navigates there
      no-access/page.tsx              # Email not in whitelist → end here
      sign-out/route.ts               # signOut + redirect to sign-in
    (print)/
      preview/[model]/page.tsx        # Datasheet HTML preview (?lang=ja&mode=full&toolbar=false); fetches image_assets for Antennas Patterns page
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
      users/                          # Admin user management (admin role only)
        route.ts                      # GET list active + pending
        invite/route.ts               # POST add to email_whitelist
        [id]/route.ts                 # PATCH role / DELETE remove
        whitelist/[email]/route.ts    # DELETE pending invite
  middleware/proxy
    src/proxy.ts                      # Next.js 16 proxy (formerly middleware) — refresh session + auth gate
  components/
    layout/navbar.tsx, solution-sidebar.tsx, main-shell.tsx, user-menu.tsx
    ask/ask-chat.tsx                    # Chat UI + citations (http external OR /wifi-regulation/* internal)
    knowledge/
      knowledge-base.tsx                # Source cards + per-row Sync/Edit, TaxonomyBadges
      taxonomy-picker.tsx               # Cascading Solution > Product Line > Model multi-select
    dashboard/dashboard-content.tsx     # Tabs + Lang column + Translations link
    product/product-detail.tsx
    preview/print-toolbar.tsx
    settings/{settings-page,personas-editor,api-keys-editor,glossary-editor,typography-editor,users-manager}.tsx
    compare/compare-table.tsx
  lib/
    auth/
      permissions.ts                  # Role + Permission types + matrix; can() / assertCan() / isRole()
      session.ts                      # getCurrentUser / requireUser / requirePermission + gate() / gateOrCron() helpers
      page-guards.ts                  # adminOnly / requirePagePermission / requireRoles for server pages
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
  types/
    database.ts           # Hand-written: convenience aliases + narrow types (e.g. layout_ack)
    database.generated.ts # Auto-generated from Supabase; used by lib/supabase/{server,client}.ts
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
- **Antennas Patterns 頁**（AP only）：`preview/[model]/page.tsx` 額外渲染一頁 polar plot grid，位於 spec pages 和 hardware overview 之間。偵測條件：`product_line.category === "APs"` 且有上傳任何 radio_pattern image。6GHz slots 由 Operating Frequency spec 含 `6 GHz` 自動加入。`.antenna-image img` 用**顯式 `width: 158pt; height: 158pt`**（has-6g 縮為 125pt），不用 max-width — 見 Common Pitfalls #31

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


### Authentication & RBAC

Three-layer enforcement:

1. **`src/proxy.ts`** (Next.js 16 — replaces `middleware.ts`) — refreshes
   Supabase session cookie on every request and redirects unauthenticated
   users to `/auth/sign-in`. Public routes: `/auth/*`, `/api/auth/*`,
   `/api/sync`, `/api/cron`. Wrapped in try/catch so any Edge runtime quirk
   falls through (defense in depth — the page layer still gates).
2. **`(main)/layout.tsx`** — server component runs `getCurrentUser()`. If
   the user has a Supabase session but no `profiles` row (i.e. email not in
   whitelist), signs them out and redirects to `/auth/no-access`.
3. **Per-route gates**:
   - API routes: `gate("permission")` returns 401/403 NextResponse on
     failure. `gateOrCron()` variant lets Vercel cron through via the
     `x-vercel-cron` header.
   - Server pages: `adminOnly()` / `requirePagePermission()` redirect
     non-authorised users to `/dashboard` before render.
   - Client UI: `can(role, "permission")` controls conditional rendering
     so PM/Viewer don't see buttons that would 403.

**Roles + permission matrix** in `lib/auth/permissions.ts`:

| Role | Capabilities |
|---|---|
| `admin` | Everything incl. user management |
| `editor` | Edit content, sync, generate PDF, translate, knowledge edit |
| `pm` | Read-only + review workflow (no Ask, no Knowledge) |
| `viewer` | Read-only + Ask SpecHub (sales / field) |

**Sign-in flow** uses PKCE via `@supabase/ssr` browser client. Caveats:
- The post-login destination (`next`) is stashed in `sessionStorage`
  before kicking off OAuth, NOT on the `redirectTo` query string.
  Supabase validates `redirectTo` verbatim against allow-list — adding
  `?next=...` makes it fail validation and silently fall back to
  `site_url` (production). `/auth/callback` redirects to `/auth/redirecting`
  which is a tiny client page that reads sessionStorage and navigates.
- Whitelist match is case-insensitive (`LOWER(email)` in trigger).

**Trigger**: `handle_new_user` (SECURITY DEFINER) fires on `auth.users`
INSERT, looks up `email_whitelist`, creates `profiles` row with the
listed role. If email not in whitelist, no profile is created — middleware
handles that case downstream.

**RLS recursion gotcha** (see Pitfalls): admin-check policies on `profiles`
must use the `current_user_is_admin()` SECURITY DEFINER helper to bypass
RLS, otherwise a SELECT triggers the policy which itself does a SELECT →
infinite recursion → query fails.

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
auth.users → profiles ← email_whitelist.invited_by
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
- `profiles` — id (FK auth.users), email, name, avatar_url, role (TEXT CHECK admin/editor/pm/viewer), last_sign_in_at, timestamps. **role values are TEXT not enum** (we DROPped the orphan `user_role` enum during migration cleanup)
- `email_whitelist` — admin-managed pre-authorisation list. email (PK, lowercase), role, invited_by (FK profiles), invited_at, note. Trigger reads this on first sign-in to create matching profile

## Conventions

- Supabase query builders 是 **PromiseLike** 但不是完整 Promise → 要用 `as { data: T | null }`
- PDF preview 用 inline `<style>` + absolute positioning 排版，不用 Tailwind
- Loading states 用 `loading.tsx` skeleton pattern
- Drive 資料夾結構與命名規則詳見 [`docs/drive-folder-and-naming-rules.md`](docs/drive-folder-and-naming-rules.md)
- **API gate pattern**: 在每支寫入 API 開頭 `const denied = await gate("permission"); if (denied) return denied;`。Cron-callable 用 `gateOrCron(request, ...)` 變體
- **Page guard pattern**: server component 開頭 `await adminOnly()` / `await requirePagePermission("xxx")` — redirects 由 Next.js 處理
- **UI hide pattern**: 從 layout/page 拿 user role → 傳給 client component → 用 `can(role, "permission")` 包按鈕。三層 gate 都要做，少一層就有 hole

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
7. **Smart Image Sync** — 已實作 Drive modifiedTime 比對，需觀察 production 穩定性
8. **Review Workflow** — Phase 2 計畫 (PM approve content → MKT generate)。設計 plan 已在對話中討論定案，等實作。需要 `products.review_approval` JSONB + content-hash bound + 在 `/api/generate-pdf` 加 approval gate
9. **Auto invite email** — 目前 admin 邀請後要手動 Slack/email 對方告知白名單已加好，可整合 Resend / Supabase email 自動寄

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

> Earlier specific-feature pitfalls (#1–#25) moved to
> [`docs/common-pitfalls.md`](docs/common-pitfalls.md) for browsing.
> What stays here are the recent / cross-cutting ones a new session is
> most likely to hit. Numbers are preserved for historical reference.

26. **Gitbook vision LED table dilution** — 原本 LED image 描述混在 page 的大 chunk 裡（跟封面、配件、mounting 圖混在一起），embedding 訊號被稀釋。解法：`ingest-gitbook.ts` 偵測 LED table pattern 後額外輸出一個 focused chunk（`chunk_index ≥ 10000`，含 bilingual header），標題乾淨如 `"ECW536 — LED Behavior"`
27. **`CitationTooltip` 連結判斷** — `ask-chat.tsx` 判斷 `source_type !== "product_spec" && (source_url.startsWith("http") || (wifi_regulation && source_url.startsWith("/")))`。新增有內部頁面的 source type 時要更新此條件
28. **Cover layout CJK metrics** — `cover-layout.ts` 的 `LOCALE_METRICS` 必須分開估 `overviewLineHeightPt` 和 `featureLineHeightPt`，因為 features 字比 overview 小（差 1pt）。用同一個 line-height 會 over-allocate features，壓縮 overview 導致假性紅燈。CJK 的 `coverGapPt` 用 10pt（非 20pt）買回空間。改 metrics 後務必用 `scripts/check-locale-layout.ts <model>` 驗證多個 locale
29. **Layout ack 格式** — `products.layout_ack` 目前兩種格式並存：legacy `true`（永遠 valid）和新 `{acked: true, hash: "..."}`（hash-bound）。讀取一律走 `isAckValid(ack, currentHash)` 判斷，別直接 `ack[locale] === true`。Hash 只涵蓋 overview + features（specs 不算，因為 spec overflow 非 per-locale）
30. **空翻譯誤判紅燈** — 啟用 ja 但還沒填 overview/features 時，若 fallback 到 EN 內容 + 用 CJK metrics 量，會假性紅燈。dashboard 和 product detail 兩處都有 `hasAnyTranslation` 守門，未翻譯時完全 skip 該 locale 的 check
31. **PDF 圖片尺寸用 `width` 不用 `max-width`** — `max-width` 只是上限，不會把小圖放大。如果來源圖檔比 CSS 上限小（例如 PM 上傳 150×150 PNG 但 max-width 設 260pt），圖會顯示自然尺寸而不是拉到目標大小。解法：用**顯式 `width: Xpt; height: Xpt`** 強制渲染到指定尺寸，`object-fit: contain` 保持 aspect ratio。Radio pattern PDF 頁就是這樣寫的（`.antenna-image img { width: 158pt; height: 158pt }`）。調過 9 輪才找到這個 root cause — 一有「改 max-width 還是太小」症狀就該想到這個
32. **Profiles RLS 無限遞迴** — Admin policies 寫成 `EXISTS (SELECT 1 FROM profiles WHERE role='admin')` 會導致 SELECT profiles 觸發 policy → policy 內的 SELECT 又觸發 policy → Postgres 回 `42P17 infinite recursion`。解法：抽出 `current_user_is_admin()` SECURITY DEFINER function，function body 的 SELECT bypass RLS。Policies 全部改用 `USING (current_user_is_admin())`。symptom 是「DB 有 row、auth.users 也有，但 getCurrentUser 回 null + redirect 到 no-access」
33. **Edge runtime + Supabase `from()` 不可靠** — Day 1 把 profile lookup 放在 `proxy.ts`（Edge runtime）裡，production 偶發 500。Edge 能跑 `auth.getUser()` 但跑 `.from("profiles").select(...)` 不穩。解法：proxy 只做 session refresh + redirect 沒登入；profile 白名單檢查移到 `(main)/layout.tsx`（Node runtime）。把所有需要 DB 查詢的東西留在 Node runtime
34. **Vercel Preview env vars 跟 Production 是分開的** — Production 設好 `NEXT_PUBLIC_SUPABASE_URL` 等不代表 Preview 也有。Preview deployment 看不到 env var → `createServerClient` 拿到 undefined → 整站 500。解法：env var 設定時要勾 All Environments（CLI: 用 Vercel REST API `POST /v10/projects/.../env` with `target: ["preview"]`），或在 Vercel Dashboard 三個環境都打勾
35. **Supabase OAuth `redirectTo` 嚴格比對** — `redirectTo` URL 帶 query string（如 `?next=/`）會跟 allow-list 的純 URL 比對失敗，Supabase 默默 fallback 到 `site_url` (production)。Preview branch 上的 user 會被 OAuth 完成後丟到 production，超詭異。解法：`redirectTo` 永遠送乾淨的 URL（無 query），post-login `next` 用 sessionStorage 暫存。callback 完成後 server redirect 到 `/auth/redirecting` (client page)，client 讀 sessionStorage 跳目的地
36. **Next.js 16 用 `proxy.ts` 不是 `middleware.ts`** — Next.js 16 把 middleware 改名為 proxy（功能一樣）。檔案在 `src/proxy.ts`，export `async function proxy(request)` 不是 `middleware`。如果同時有 `middleware.ts` 和 `proxy.ts` build 會直接 fail
37. **Vercel cron 用 `x-vercel-cron` header 區分** — `CRON_SECRET` env var 沒設（也不需要設）。Vercel cron 觸發 `/api/sync` 時自動帶 `x-vercel-cron: 1` header，這個 header 不能從外部 spoof。`gateOrCron()` 先檢查這個 header 再 fallback 到 `CRON_SECRET` bearer 再 fallback 到 user permission

## 詳細文件

- [`docs/common-pitfalls.md`](docs/common-pitfalls.md) — Pitfalls archive #1–#25（早期特定 feature 的踩雷紀錄）
- [`docs/rag-context.md`](docs/rag-context.md) — Ask SpecHub / RAG 完整架構
- [`docs/sync-and-notifications.md`](docs/sync-and-notifications.md) — Sync 機制 + Telegram 通知流程
- [`public/docs/drive-folder-and-naming-rules.html`](public/docs/drive-folder-and-naming-rules.html) — Drive 資料夾結構、檔名規則、Detail Specs 填寫規則
