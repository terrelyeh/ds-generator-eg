# CLAUDE.md — Project Context

> Last updated: 2026-05-06 (PDF gen + sync hardening: locale gates, duplicate defenses, legacy folder migration)

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
- **Drive folder auto-create**：`uploadPdfToDrive` 透過 `resolveLocaleLineFolder()` 自動建立缺失的 sibling locale line folder（`Cloud Camera_zh`）。容忍 PM typo（`_zh-TW`、`_ZH`、`_jp` 等），找到任何一個就用 + warn
- **Legacy folder migration**：找不到 canonical 的 `DS_Cloud_<model>_<suffix>` 時，會搜尋 legacy `_v<X>.<Y>` 後綴版本，把最高版號那個 rename 成 canonical，舊 PDF 留在裡面。EN/locale 雙路徑都生效
- **Drive overwrite + dedupe**：同名 PDF 找到就 update content + trash 多餘重複（非 hard delete — Shared Drive 通常 `canTrash=true canDelete=false`，hard delete 會 404）
- **Locale Draft 阻擋**：`product_translations.confirmed = false` 時 API 回 409；UI 也擋（顯示「⚠️ Translation in Draft」黃字警告）
- **Role gating**：PM/Viewer 角色看 preview link 時，Regenerate 按鈕整塊隱藏，顯示「Preview only · PM」
- **Puppeteer 自我認證**：`/api/generate-pdf` 內部的 Puppeteer 會 fetch 自己的 `/preview/[model]`，proxy 看 `x-vercel-protection-bypass` header（已存在的 `VERCEL_AUTOMATION_BYPASS_SECRET` env var）放行，否則 Puppeteer 會抓到 sign-in 頁印成 PDF
- **UX**：PDF gen 全部用 `toast.loading` → `toast.success` with `Open PDF` action button（不直接 `window.open`，因為 popup blocker 會擋 async-after window.open）

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
- `versions` — version, **locale**, pdf_storage_path, changes, generated_at. **UNIQUE (product_id, version, locale)**（00013 migration 修；之前漏 locale 會 silent fail，見 pitfall #45）
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
- **Supabase write error checking**: 所有 insert/update/upsert 結果都要看 `error`。helper 寫成 `throwIfDbError(label)(res)` 形式 surface 失敗。silent error swallow 是這個系統最久的雷（pitfall #45）
- **PDF gen UX**: 兩條路徑（print-toolbar、product-detail handleGeneratePdf）都用 `toast.loading` → `toast.success` with `Open PDF` action button，不直接 `window.open`（pitfall #47）

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

> Pitfalls #1–#37 archived to [`docs/common-pitfalls.md`](docs/common-pitfalls.md)
> (RAG, layout metrics, auth setup, OAuth flow, Vercel cron, Next.js 16
> proxy rename — all stable / specific-subsystem). Inline below are the
> recent / cross-cutting ones a new session is most likely to hit (PDF
> generation pipeline + Supabase write hygiene). Numbers preserved.

38. **`versions` table unique constraint 一定要含 `locale`** — 早期建表用 `UNIQUE (product_id, version)`，沒包 locale。EN v1.0 存在後再 INSERT zh-TW v1.0 撞 duplicate key，`/api/generate-pdf` 又沒檢查 insert error → silent fail。products.current_versions 仍被更新成假裝 zh-TW PDF 存在，UI 顯示 "Regenerate v1.0" 但實際 versions row + Drive 都空。00013 migration 已修，constraint 改 `(product_id, version, locale)`。**所有 supabase insert/update/upsert 都要檢查 `error`** — 用 `throwIfDbError(label)` helper 包，silent fail 是這個系統踩過最久的雷

39. **Drive PDF 上傳要分 EN/locale 用不同 parent + 用 `getLocaleSuffix()`** — `uploadPdfToDrive` 早期 bug：(a) filename 用 raw `locale`（產生 `_zh-TW.pdf`，正確應該是 `_zh.pdf`），(b) 上傳時 parent 永遠用 EN line 資料夾（locale PDF 跑去 nested 在 EN 線下），(c) 沒檢查同名舊檔，每次 Regenerate 累積一份。修法：parent 用 `resolveLocaleLineFolder()`（auto-create sibling locale line folder），filename 用 `getLocaleSuffix(locale)`，list 同名 → 第一個 update 內容、其他 trash

40. **Service account 在 Shared Drive 通常 `canTrash=true canDelete=false`** — `drive.files.delete` 對 PM 擁有的 Shared Drive 內檔案會回 404（其實是 permission denial 偽裝）。要刪檔一律用 `drive.files.update({ trashed: true })`。Trash 是 reversible 的，service account 自己建的檔也適用。`uploadPdfToDrive` 的去重和 `cleanup-misplaced-locale-pdfs.mjs` 都用 trash

41. **Drive locale line folder 自動建** — 從 2026-05-06 起，`resolveLocaleLineFolder()` / `resolveLocaleDsImagesFolder()` 找不到 sibling locale line folder（如 `Cloud Camera_zh`）時會**自動建在 root 底下**，而不是 throw。容忍 PM typo: 先找 canonical (`Cloud Camera_zh`)，沒有再找 `Cloud Camera_zh-TW` / `Cloud Camera_ZH` / `Cloud Camera_jp` (legacy ja 命名)，找到任何一個就用 + warn。都沒找到才建 canonical。改的是雙刃劍：少了 PM friction 但 typo 也不會被發現，所以要看 console.warn

42. **Sheet 同 model 出現多次 → sync ping-pong** — 早期 `loadAllProductsFromSheet` 用 `Map.set()` 在 column loop 裡，最後一個 occurrence 贏；`findModelColumn`（單 model 用）只回第一個。所以全線 sync 跟單 model resync **抓到不同 column**，每隔幾次互相覆寫。修法：兩者都用 first-occurrence + `seenModels` Set 跳過重複，console.warn 提醒 PM 清 Sheet。symptom 是「value 看起來在 NEW/OLD 之間 ping-pong，每次 sync 結果不一致」

43. **`drive.files.delete` 在 Shared Drive 會回 404 偽裝成 not found** — 其實是 permission denial（`canTrash=true canDelete=false`）。一律改用 `drive.files.update({ trashed: true })` — 對 service account 自己建的檔也適用，且 reversible

44. **`uploadPdfToDrive` 三件事必須一起做對** — (a) filename 用 `getLocaleSuffix(locale)` 而不是 raw `locale`（不然 `_zh-TW.pdf` 而非 `_zh.pdf`）；(b) parent 用 `resolveLocaleLineFolder()` 解析 sibling locale line folder，不是直接拿 EN line folder；(c) 同名舊檔要先 list → update 第一個 + trash 其他（不檢查就每次 Regenerate 累積一份重複）。三個都錯過

45. **Supabase silent insert/update 是這個系統最久的雷** — supabase-js 的 write 不 throw on error，回 `{ data, error }`。歷史教訓：`versions` table unique constraint 漏 locale → INSERT 撞 dup key → silent fail → `products.current_versions` 仍被更新成假裝 PDF 存在 → UI 顯示 "Regenerate v1.0" 但 row 跟 Drive 都空。慣例：所有 supabase write 一律 `throwIfDbError(label)(res)` 包起來。00013 migration 已修 constraint 加 locale

46. **Puppeteer 自 fetch 撞自己的 auth gate** — `/api/generate-pdf` 內部呼叫 Puppeteer 抓 `/preview/[model]`。Day 3 加 auth proxy 後，這個 internal request 沒 cookie → 被 redirect 到 `/auth/sign-in` → Puppeteer 把 sign-in 頁印成 PDF。修法：proxy 認 `x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET` header（generate-pdf 已經有附給 Puppeteer 用於 Vercel Deployment Protection），同個 secret 兩用

47. **Browser popup blocker 會擋 async-after `window.open`** — `await fetch(...)` 等了幾十秒後再 `window.open(pdf)`，Chrome/Safari 不認為是 user gesture → 靜默吞掉。修法：用 `toast.success(..., { action: { label: "Open PDF", onClick: () => window.open(...) } })` — toast 上的 click 是真實 user gesture，瀏覽器一定放行

48. **`(print)/layout.tsx` 沒有 Toaster** — 預設只 export children，不 mount Toaster。print-toolbar（在 preview 頁）用 sonner toast 之前要記得在 print layout 也 mount `<Toaster />`，不然 toast 出不來

## 詳細文件

- [`docs/common-pitfalls.md`](docs/common-pitfalls.md) — Pitfalls archive #1–#25（早期特定 feature 的踩雷紀錄）
- [`docs/rag-context.md`](docs/rag-context.md) — Ask SpecHub / RAG 完整架構
- [`docs/sync-and-notifications.md`](docs/sync-and-notifications.md) — Sync 機制 + Telegram 通知流程
- [`public/docs/drive-folder-and-naming-rules.html`](public/docs/drive-folder-and-naming-rules.html) — Drive 資料夾結構、檔名規則、Detail Specs 填寫規則
