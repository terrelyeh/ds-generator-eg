# CLAUDE.md — Product SpecHub (apps/spechub)

> Last updated: 2026-06-11（monorepo 拆分 Phase 3–4：RAG/Ask/Knowledge 全部
> 析出到 **apps/engenie**（含 lib/rag、聊天 UI、workspaces、對外 Search API、
> wifi-regulation、LLM keys 設定頁）。本 app 回歸純 datasheet/文件生成平台。
> 共用碼在 packages：`@eg/db`（supabase clients/settings/types/migrations）、
> `@eg/auth`（session/RBAC/page-guards）。RAG/Ask 的事去看
> [apps/engenie/CLAUDE.md](../engenie/CLAUDE.md)。）

## Project Overview

**Product SpecHub** — EnGenius 產品規格管理與 Datasheet 自動化系統。
從 Google Sheets 同步產品資料到 Supabase，前端提供 Dashboard 管理、
Spec Comparison、Change Log，並能生成 PDF Datasheet（多語言）。

**7 個產品線**（全屬 EnGenius Cloud solution）：Cloud AP, Cloud Switch,
Cloud Camera, Cloud AI-NVS, Cloud VPN Firewall, Switch Extender, Unmanaged Switch。
架構已支援**多 Solution 擴展**（`solutions` 表 + `/dashboard/[solution]` 路由）。

功能清單與產品定位詳見 [README.md](README.md)。

## Monorepo 接點（重要）

與 **EnGenie**（apps/engenie）共用同一個 Supabase（`xzolvtlqafwkxfuaryec`）：

1. **sync 後自動 re-index**：`/api/sync` 完成後 POST EnGenie 的
   `/api/cron/reindex-products`（`Bearer CRON_SECRET`，兩 Vercel 專案同值；
   `ENGENIE_INTERNAL_URL` 指向 engenie 網域）。失敗不擋 sync —— EnGenie 每日
   09:30 TW 有全量備援 cron。
2. **側邊 Ask 面板已改為 EnGenie 浮動 widget**（`components/layout/engenie-widget.tsx`，
   workspace `spechub`，由 `NEXT_PUBLIC_ENGENIE_URL` 載入 widget.js）。navbar 的
   Ask / Knowledge 是連到 EnGenie 網域的外部連結。
3. **LLM provider keys 管理 UI 在 EnGenie**（settings 首頁有連結卡）；本 app 的
   translate runtime 直接讀共用 `app_settings`（`@eg/db/settings` 的 `getApiKey`）。
4. **產品表 schema 演進權在本 app**；改 products/product_lines schema 前要確認
   EnGenie 的 ingest-products/taxonomy 不受影響。migrations 一律放
   `packages/db/supabase/migrations/`。

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **UI**: Tailwind CSS v4 + shadcn/ui；**Table**: @tanstack/react-table（Compare 頁）
- **Backend**: Supabase via `@eg/db`（Postgres + Storage + Auth via Google OAuth）
- **Auth**: `@eg/auth` — @supabase/ssr + Google OAuth + DB whitelist + 4-role RBAC
- **Deployment**: Vercel（專案 `ds-generator-eg`，Root Directory `apps/spechub`）+ Vercel Cron
- **Data Source**: Google Sheets API + Google Drive API → synced to Supabase
- **Notifications**: Telegram Bot API
- **PDF**: Puppeteer (server-side) + browser print (client-side)

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
      docs/sync/page.tsx
      settings/                        # hub + glossary / typography / users
    auth/                              # Google OAuth flow（與 engenie 各持一份）
    (print)/preview/[model]/page.tsx   # Datasheet HTML preview（?lang=ja&mode=full&toolbar=false）
    api/
      sync/route.ts                    # Sheets → Supabase sync + 觸發 EnGenie re-index
      generate-pdf/route.ts            # Puppeteer PDF + generation lock
      resync-product/、resync-versions/、detect-locale-version/
      upload-image/route.ts            # Upload to Supabase + Google Drive
      translate/route.ts               # AI translation endpoint (multi-provider)
      translations/{product,spec-labels}/、glossary/
      settings/{providers,typography,fonts}/  # providers 與 engenie 各持一份
      products/[model]/layout-ack/
      notify/、users/*                  # Telegram 通知、admin user management
  proxy.ts                             # session refresh + auth gate + Puppeteer automation bypass（已簡化）
  components/
    layout/{navbar,main-shell,user-menu,engenie-widget}.tsx
    dashboard/、product/、compare/、changelog/、translations/、preview/
    settings/{settings-page,glossary-editor,typography-editor,users-manager}.tsx
    ui/                                # shadcn（與 engenie 各持一份）
  lib/
    google/{auth,sheets,sheets-extra,drive-versions,drive-images}.ts
    datasheet/                         # cover-layout、pagination、layout-check、layout-ack、typography、locales/
    translate/                         # prompts + providers (claude/openai/gemini)
    notifications/
packages/（repo root）
  db/    → @eg/db：supabase server/client/admin、settings(getApiKey)、DB types、supabase/migrations/
  auth/  → @eg/auth：session(gate/gateOrCron)、permissions(can/矩陣)、page-guards(adminOnly…)
```

## Architecture & Data Flow

### 同步、狀態、圖片 → [`docs/datasheet-sync.md`](docs/datasheet-sync.md)

Google Sheets → Supabase 同步(欄位映射)、Product Status(active/upcoming/pending)、
Smart Sync(Drive modifiedTime + deep diff)、sync 後觸發 EnGenie re-index、
locale-aware 圖片雙向同步。另見 [`docs/sync-and-notifications.md`](docs/sync-and-notifications.md)。

### Datasheet 渲染:PDF / 版面 / 多語言 → [`docs/datasheet-rendering.md`](docs/datasheet-rendering.md)

PDF 生成(Regenerate/New Version、Puppeteer 自我認證、Drive folder auto-create/dedupe、
locale Draft 阻擋)、動態 cover 版面 + spec 2 欄分頁(`lib/datasheet/`,**locale-aware
metrics 常數須對齊 preview CSS — pitfall #50/#51**)、多語言 datasheet(兩層翻譯、
Draft/Confirmed、per-locale typography、5 層 AI 翻譯 prompt)。**改 PDF/版面/翻譯前先讀該檔。**

### Authentication & RBAC → [`docs/auth-rbac.md`](docs/auth-rbac.md)

三層強制:`proxy.ts`(session refresh + auth gate;公開路由只剩 `/auth/`、service
path `/api/sync`)→ `(main)/layout.tsx`(whitelist 檢查)→ per-route gates
(`gate()`/`gateOrCron()`/`adminOnly()`/`requirePagePermission()` + client `can()`)。
4 角色矩陣在 **`@eg/auth/permissions`**(packages/auth)。**改 auth/proxy/權限前先讀該檔。**

## Brand & Visual System

- Primary Blue: `#03a9f4` → `text-engenius-blue`, `bg-engenius-blue`
- Dark Text: `#231f20`；Gray Text: `#6f6f6f`；NO pure black `#000000`
- **Heading font**: Plus Jakarta Sans (`font-heading`)；**Body**: Geist Sans

## Database Tables

```
solutions → product_lines → products → spec_sections → spec_items
                             products → image_assets, change_logs, versions
             product_lines → comparisons, cloud_comparisons, revision_logs
auth.users → profiles ← email_whitelist.invited_by
```

本 app 擁有 schema 演進權：products、product_lines、versions、product_translations、
spec_label_translations、translation_glossary、profiles、email_whitelist、app_settings。
EnGenie 擁有：documents、ask_workspaces、api_keys、chat_sessions、topology_icons。
共同：`solutions`（本 app 管產品 solution；engenie 只加 `kind='knowledge'` 列）。

Key tables:
- `solutions` — id, name, slug, label, color_primary, ds_template, sort_order, **kind**
  ('product'|'knowledge')。**dashboard sidebar 篩 `kind='product'` 且 `product_line_count>0`**
- `product_lines` — solution_id (FK), ds_prefix, ds_images_folder_id, drive_folder_id,
  sort_order, **spec_footnote** + **spec_footnote_translations** (JSONB), **qr_url_template**
  (NULL=用 dict default;`{model}` 替換 lowercase model_name。Cloud AP/Camera 維持短連結
  `qr.engenius.ai/qsg/<model>`;VPN FW/NVS/Switch/L3 Switch/Extender 用 doc.engenius.ai 結構)。
  Resolution priority：`product_translations.qr_url` → `qr_url_template` → `dict.defaultQrUrl`
- `products` — status, current_version, **current_versions** (JSONB: `{"en":"1.1","ja":"1.0"}`)
- `versions` — version, **locale**, pdf_storage_path, changes。**UNIQUE (product_id, version, locale)**（pitfall #45）
- `product_translations` — per-product per-locale: headline, **subtitle**, overview, features,
  hardware_image, qr_label, qr_url, translation_mode, **confirmed**
- `spec_label_translations` — per-line per-locale label 翻譯；`translation_glossary` — 詞庫
- `app_settings` — key-value: API keys（LLM）、`typography_${locale}`、`custom_fonts_${locale}`、
  `pdf_lock_{model}_{lang}`（**與 EnGenie 共用**;keys 管理 UI 在 EnGenie）
- `profiles` — role TEXT CHECK (admin/editor/pm/viewer)；`email_whitelist` — 邀請制白名單

## Conventions

- Supabase query builders 是 **PromiseLike** 但不是完整 Promise → 要用 `as { data: T | null }`
- PDF preview 用 inline `<style>` + absolute positioning 排版，不用 Tailwind
- Loading states 用 `loading.tsx` skeleton pattern
- Drive 資料夾結構與命名規則詳見 [`docs/drive-folder-and-naming-rules.md`](docs/drive-folder-and-naming-rules.md)
- **API gate pattern**: 寫入 API 開頭 `const denied = await gate("permission"); if (denied) return denied;`
  （cron-callable 用 `gateOrCron(request, ...)`）— 皆來自 `@eg/auth/session`
- **Page guard pattern**: server component 開頭 `await adminOnly()` / `await requirePagePermission("xxx")`
- **UI hide pattern**: layout/page 拿 role → client component 用 `can(role, "permission")` 包按鈕。三層 gate 都要做
- **Supabase write error checking**: 所有 write 都要看 `error`，用 `throwIfDbError(label)(res)`（pitfall #45）
- **PDF gen UX**: 兩條路徑都用 `toast.loading` → `toast.success` + `Open PDF` action button（pitfall #47）

### UI Layout Conventions

- **Dashboard 兩行 toolbar**: Row 1 = product line tabs；Row 2 = Active toggle | Compare
  Changelog Translations | Sync + Lang column 顯示已啟用語言 badges
- **Product page sticky header**: `sticky top-14 z-20`
- **Breadcrumb**: `[ProductLine] / [Model]`，ProductLine 連結帶 `?line=` 回正確 tab
- **Solution sidebar**: 預設收合；**Datasheet 佈景**: Cloud = `#03a9f4`，Unmanaged = `#58595B`

## Current Status

功能清單詳見 [README.md](README.md)。

### 🔜 Next Steps

**🏗️ Monorepo 拆分** — Phase 1–3 已完成（骨架、packages、engenie 析出）。
剩餘：Phase 5 切換（merge main、prod 部署、跑藍圖 §6 驗收、更新 engenius-kb
skill 的 API base URL）。藍圖見 [`docs/monorepo-split-plan.md`](docs/monorepo-split-plan.md)。

**Datasheet 系統**：
1. **多國語言擴展到其他產品線** — 需為 AP/Switch/NVS/VPN FW 建立 product-line prompt
2. **翻譯 feedback 偵測** — Save 時偵測使用者修改，建議加入詞庫
3. **多張 Hardware 圖支援** — front/rear/bottom 最多 3 張
4. **Resync versions per-locale** — `/api/resync-versions` 目前只更新 EN
5. **新增第 4 個翻譯語言（如 es）** — 動 8 個檔案：`locales/types.ts`(union+SUPPORTED_LOCALES)、
   `locales/es.ts`、`locales/index.ts`、`cover-layout.ts` LOCALE_METRICS、`typography.ts`
   TYPOGRAPHY_DEFAULTS、`translate/prompts/locales/es.ts`、`translate/index.ts` 註冊、
   `getLocaleSuffix()` fall-through 免動

**系統**：
6. **Review Workflow** — PM approve content → MKT generate。需要 `products.review_approval`
   JSONB + content-hash bound + `/api/generate-pdf` approval gate
7. **Auto invite email** — admin 邀請後自動通知（Resend / Supabase email）

## Deployment

```bash
npm run dev      # repo root — 轉發到 spechub (port 3000)；engenie 是 -w engenie (port 3100)
npm run build
npm run lint
```

- Vercel 自動部署 main branch；Cron: `/api/sync` 每天 09:00 台灣時間
- **⚠️ Vercel function region 釘在 `hnd1`（東京）— 不要改**。Supabase 在 ap-northeast-1，
  跨區每 query +170ms
- **Server component query 並行化** — 互相獨立的 query 塞同一個 `Promise.all`
- 需要的 env vars: `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `GOOGLE_SERVICE_ACCOUNT_JSON`, `TELEGRAM_BOT_TOKEN/CHAT_ID`, `CRON_SECRET`（與 engenie 同值）,
  `VERCEL_AUTOMATION_BYPASS_SECRET`, `PDF_PREVIEW_BASE_URL`, **`ENGENIE_INTERNAL_URL`**,
  **`NEXT_PUBLIC_ENGENIE_URL`**, `API_KEY_ENC_SECRET`（讀共用加密設定時需要）
- AI 翻譯 keys 在 EnGenie `/settings/api-keys` 設定（共用 app_settings），env 可覆蓋

## Common Pitfalls

> Pitfalls #1–#44, #46, #48 archived to [`docs/common-pitfalls.md`](docs/common-pitfalls.md)。
> #54–#58（RAG/聊天相關）搬到 [apps/engenie/CLAUDE.md](../engenie/CLAUDE.md)。

45. **Supabase silent insert/update 是這個系統最久的雷** — supabase-js 的 write 不 throw on
    error，回 `{ data, error }`。歷史教訓：`versions` unique constraint 漏 locale → INSERT 撞
    dup key → silent fail → UI 顯示假狀態。慣例：所有 write 一律 `throwIfDbError(label)(res)`。

47. **Browser popup blocker 會擋 async-after `window.open`** — 修法：`toast.success(..., {
    action: { label: "Open PDF", onClick: () => window.open(...) } })` — toast 上的 click
    是真實 user gesture。

49. **Translation Save & Confirm 不能綁 `dirty`** — Save 條件 = 「有翻譯內容 AND (locale 還是
    Draft OR dirty)」；Preview 對 Draft locale 跳 toast；Draft 狀態按鈕 amber + pulse。三層一起做。

50. **Pagination 常數一定要對齊實際 CSS** — `AVAILABLE_HEIGHT = 792 - TOP_BAR - SPEC_TITLE -
    BOTTOM_MARGIN`；SPEC_TITLE_HEIGHT 62pt、SPEC_BASE_ROW_HEIGHT 23pt、CATEGORY_HEADER 22pt；
    **CJK row metrics 更大**（JA 24pt / zh-TW 25pt）。`splitIntoPages(sections, locale)` 必須傳
    locale。每改 preview CSS 必須同步檢查這些常數。

51. **`balanceColumns` 要用「高度」+ `splitOccurred` flag 必設** — 枚舉 split index 挑
    `|leftH - rightH| + overflow_penalty` 最小；fitSection 兩個分支都要 set 旗標，否則好版面被
    count-based 覆寫。

52. **Features 排列 = balanced column-first** — 順序填左欄到接近總高一半，剩下進右欄（保留
    PM 優先順序 + 視覺平衡，不要 height-greedy 交錯）。

53. **新產品線設定容易把 `drive_folder_id` 跟 `ds_images_folder_id` 填反** — drive_folder_id
    是「產品線」資料夾、ds_images_folder_id 是裡面的「DS Images」子資料夾。設定時跟 PM 確認層級。

## 詳細文件

- [`docs/monorepo-split-plan.md`](docs/monorepo-split-plan.md) — 拆分藍圖（歸屬/階段/驗收/回滾）
- [`docs/common-pitfalls.md`](docs/common-pitfalls.md) — Pitfalls archive #1–#25
- [`docs/sync-and-notifications.md`](docs/sync-and-notifications.md) — Sync 機制 + Telegram 通知
- [`docs/datasheet-sync.md`](docs/datasheet-sync.md) — Sheets 同步、product status、圖片雙向同步
- [`docs/datasheet-rendering.md`](docs/datasheet-rendering.md) — PDF 生成、版面、多語言 + AI 翻譯
- [`docs/auth-rbac.md`](docs/auth-rbac.md) — 認證/proxy/RBAC 三層、權限矩陣、RLS
- [`public/docs/drive-folder-and-naming-rules.html`](public/docs/drive-folder-and-naming-rules.html) — Drive 規則
- RAG / Ask / Search API → [apps/engenie/docs/](../engenie/docs/)
