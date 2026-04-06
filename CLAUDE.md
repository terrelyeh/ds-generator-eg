# CLAUDE.md — Project Context

> Last updated: 2026-04-06

## Project Overview

**Product SpecHub** — EnGenius 產品規格管理與 Datasheet 自動化系統。
從 Google Sheets 同步產品資料到 Supabase，前端提供 Dashboard 管理、
Spec Comparison、Change Log，並能生成 PDF Datasheet。
目前支援三個產品線：Cloud AP、Cloud Switch、Cloud Camera。

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

## Next.js 16 Breaking Changes (IMPORTANT)

- `params` and `searchParams` are **Promises** — must be awaited
- `cookies()` and `headers()` are **async** — must be awaited
- Fetch requests are **not cached by default**
- Server Components are the default; use `'use client'` for state/hooks/events

## Directory Structure

```
src/
  app/
    (main)/                    # Route group: pages with Navbar
      dashboard/page.tsx       # Product list, tab per product line
      dashboard/loading.tsx    # Skeleton loading state
      compare/[line]/page.tsx  # Spec comparison (TanStack Table)
      changelog/[line]/page.tsx # Sync change logs + revision log
      product/[model]/page.tsx  # Product detail (images, overview, specs, versions)
      docs/sync/page.tsx        # Sync & notification guide (native JSX, no markdown)
    (print)/                   # Route group: no Navbar, for PDF
      preview/[model]/page.tsx # Datasheet HTML preview → Save as PDF
    api/sync/route.ts          # Google Sheets → Supabase sync
    api/generate-pdf/route.ts  # Puppeteer PDF generation
    api/upload-image/route.ts  # Image upload to Supabase Storage
  components/
    compare/compare-table.tsx  # TanStack Table with search, sort, column toggle
    dashboard/dashboard-content.tsx  # Tabs, product table (sync button is in Navbar)
    product/product-detail.tsx # Model detail: images, overview, features, specs, versions
    preview/print-toolbar.tsx  # Client component: Save as PDF button
    ui/                        # shadcn/ui primitives
  lib/
    google/sheets.ts           # Parse Web Overview + Detail Specs tabs
    google/sheets-extra.ts     # Parse Revision Log, Comparison, Cloud Comparison
    google/drive-images.ts     # Sync product images from Drive → Storage
    google/auth.ts             # Google service account auth
    supabase/admin.ts          # Admin client (bypasses RLS, used by sync)
    supabase/server.ts         # Server client (with cookies)
    datasheet/pagination.ts    # Split spec sections into PDF pages
    notifications/index.ts     # Telegram notifications
  types/database.ts            # Supabase DB types
```

## Architecture & Data Flow

完整的同步機制、變更偵測、Telegram 通知流程詳見 [`docs/sync-and-notifications.md`](docs/sync-and-notifications.md)。

### Google Sheets → Supabase Sync

每個產品線有一個 Google Sheet，包含以下頁籤：

| 頁籤 | 解析函式 | 存入 Supabase | 前端頁面 |
|---|---|---|---|
| Web Overview | `parseOverviewData` | products (full_name, overview, features) | Datasheet |
| Detail Specs | `parseSpecSections` | spec_sections → spec_items | Datasheet |
| Comparison | `loadComparison` | comparisons | /compare/[line] |
| Revision Log | `loadRevisionLogs` | revision_logs | /changelog/[line] |

**Web Overview 使用的欄位**（已統一命名）：
- `Model Name` → `products.full_name`（fallback `Model Description`）
- `Single Overview` → `products.overview`
- `Key Feature Lists` → `products.features` (JSON array)
  - Sheet 內容是**純換行分隔**（非 `*` 前綴），parser 自動 strip `*`/`•`/`-` 前綴

### Smart Sync

- Vercel Cron 每天 01:00 UTC (09:00 Taiwan) 觸發 `POST /api/sync`
- 用 Drive API `modifiedTime` 比對 `product_lines.last_synced_at`，未改動則跳過
- 手動按 Navbar 右上角 "Sync" 帶 `?force=true` 同步所有產品線
- Deep diff：field-level + spec-level + comparison table 比對
  - 產品變更：`changes_detail` (JSONB) + `changes_summary` (compact one-liner)
  - Comparison 變更：model added/removed + spec value changes，`product_id: null`
- Telegram 通知：按產品線分組，每個產品一行摘要（如 "9 features added, subtitle modified"）

### Comparison Parser

- `loadComparison`：**動態 category detection**（row 的所有 model column 都完全空白 = category header）
- AP/Switch 的 Sheet 是 flat table（無 category header），所有 spec 歸類為 "General"
- Camera 有真正的 category（Optics, Video, Audio 等）
- 兩個 parser 都用 `getHiddenColumns()` 過濾 Google Sheets 中隱藏的欄位

## Brand & Visual System

- Primary Blue: `#03a9f4` → `text-engenius-blue`, `bg-engenius-blue`
- Dark Text: `#231f20` → `text-engenius-dark`
- Gray Text: `#6f6f6f` → `text-engenius-gray`
- NO pure black `#000000`
- **Heading font**: Plus Jakarta Sans (`font-heading`)，用於 Navbar 品牌標題
- **Body font**: Geist Sans（`font-sans`）

## Database Tables

```
product_lines → products → spec_sections → spec_items
                products → image_assets, change_logs
                product_lines → comparisons, cloud_comparisons, revision_logs
auth.users → profiles
```

Key columns:
- `product_lines.last_synced_at` — Smart Sync 用
- `change_logs.changes_detail` — JSONB structured diff `{field, from, to, type}`
- `comparisons` — model_name + category + label + value（flat rows）

## Conventions

- Supabase query builders 是 **PromiseLike** 但不是完整 Promise → 不能用 `Promise.all` type assertion，要用 sequential `await` + `as { data: T | null }`
- PDF preview 用 inline `<style>` + absolute positioning 排版，不用 Tailwind
- Dashboard 用 AP/Switch/Camera tab，不用 "All" tab
- Loading states 用 `loading.tsx` skeleton pattern（dashboard, compare, changelog 都有）

### UI Layout Conventions

- **所有頁面容器**: `max-w-[1400px] mx-auto px-6 py-8`
- **Navbar**: `sticky top-0 z-50`，內容同樣 `max-w-[1400px]`
- **Breadcrumb**: 所有子頁面頂部都有 `Dashboard / [ProductLine] / [Model]` 導覽路徑
- **Table 共用模式**: 表頭 `border-b-2 border-foreground/10~15`、zebra striping `bg-muted/30`、hover `bg-engenius-blue/[0.06]`
- **Dashboard 表頭 sticky**: `[&_th]:sticky [&_th]:top-14 [&_th]:z-10 [&_th]:bg-muted`（top-14 = navbar 高度）
- **Card 容器**: 統一 `rounded-lg border bg-card shadow-sm`
- **Status 指示器**: 綠色實心圓點（ready）/ 灰色空心圓點（missing）
- **Action links**: pill 按鈕樣式 `rounded px-2 py-0.5 text-xs font-medium text-engenius-blue hover:bg-engenius-blue/10`

## Current Status

功能清單詳見 [README.md](README.md)。

### 🔜 Next Steps — Phase 4

1. **各產品線 Datasheet 內容確認與排版優化**
   - AP 需額外加入 Radio Pattern 圖片區塊
   - 各產品線的 cover page 排版可能因內容量不同需微調
2. **多國語言版 Datasheet** — 執行方式待討論
3. **產品照片命名整理** — 統一所有產品線的圖片檔命名規則

## Deployment

```bash
npm run dev    # Local dev server (port 3000)
npm run build  # Production build
npm run lint   # ESLint check
```

- Vercel 自動部署 main branch
- Vercel Cron: `vercel.json` → `"0 1 * * *"` (每天 09:00 台灣時間)
- 需要的 env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `CRON_SECRET`

## Common Pitfalls

1. **Google Sheets UNFORMATTED_VALUE 回傳 Excel serial number** — 日期欄位會是 5 位數字（如 45512），需轉換。`parseRevisionDate` 先檢查 8/6 位 compact 格式，最後才檢查 serial number（限定 5 位 + 30000-60000 範圍）
2. **Shared Drive 需要 `supportsAllDrives: true`** — Drive API `files.get` 不加這個參數會 404
3. **Telegram 訊息 4096 字元上限** — 同步多產品時超長訊息要截斷到 4000 字
4. **Brave 瀏覽器 PDF 多空白頁** — Brave 的 print engine 有差異，建議用 Chrome 存 PDF。已加 JS `beforeprint` event 用 body height clamping 盡量緩解
5. **Comparison dynamic category detection** — 判斷邏輯：row 所有 model column 完全空白（連 `-` 都沒有）才算 category。`-` 代表 "不適用"，算有值
6. **Web Overview features 格式** — Sheet 裡的 Key Feature Lists 是純換行分隔文字（非 `* ` bullet 格式），parser 需要處理兩種格式。label 欄位本身可能含換行（如 `"Key Feature Lists \n (條列式功能)"`），用 `includes()` 匹配而非 exact match
7. **Compare table 欄位壓縮** — table 必須用 `min-w-max`（非 `w-full`），否則 24+ model 欄位會被壓縮到容器寬度。搭配 `overflow-auto` 讓表格在卡片內橫向滾動
8. **Table sticky header 需要 `overflow-x-clip`** — base Table 元件的容器用 `overflow-x-clip`（非 `overflow-x-auto`），否則 `position: sticky` 無法穿透 scroll container 生效
