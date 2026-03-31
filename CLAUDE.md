# CLAUDE.md — Project Context

> Last updated: 2026-03-31

## Project Overview

EnGenius 產品 Datasheet 自動化系統。從 Google Sheets 同步產品資料到 Supabase，
前端提供 Dashboard 管理、Spec Comparison、Change Log，並能生成 PDF Datasheet。
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
    (print)/                   # Route group: no Navbar, for PDF
      preview/[model]/page.tsx # Datasheet HTML preview → Save as PDF
    api/sync/route.ts          # Google Sheets → Supabase sync
    api/generate-pdf/route.ts  # Puppeteer PDF generation
    api/upload-image/route.ts  # Image upload to Supabase Storage
  components/
    compare/compare-table.tsx  # TanStack Table with search, sort, column toggle
    dashboard/dashboard-content.tsx
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

**Web Overview 使用的欄位**（各產品線命名正在統一中）：
- `Model Description` / `Model Name` → `products.full_name`
- `Single Overview`（優先）→ fallback `Overview` → `products.overview`
- `Key Feature Lists` / `Key Feature` → `products.features` (JSON array)

### Smart Sync

- Vercel Cron 每天 01:00 UTC (09:00 Taiwan) 觸發 `POST /api/sync`
- 用 Drive API `modifiedTime` 比對 `product_lines.last_synced_at`，未改動則跳過
- 手動按 Dashboard 的 "Sync from Sheets" 帶 `?force=true&line=<name>` 只同步當前產品線
- Deep diff：field-level + spec-level 比對，產生 `changes_detail` (JSONB) + `changes_summary` (text)

### Comparison Parser

- `loadComparison`：**動態 category detection**（row 的所有 model column 都完全空白 = category header）
- AP/Switch 的 Sheet 是 flat table（無 category header），所有 spec 歸類為 "General"
- Camera 有真正的 category（Optics, Video, Audio 等）
- 兩個 parser 都用 `getHiddenColumns()` 過濾 Google Sheets 中隱藏的欄位

## Brand Colors

- Primary Blue: `#03a9f4` → `text-engenius-blue`, `bg-engenius-blue`
- Dark Text: `#231f20` → `text-engenius-dark`
- Gray Text: `#6f6f6f` → `text-engenius-gray`
- NO pure black `#000000`

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

## Current Status

功能清單詳見 [README.md](README.md)。

### 🔜 Next Steps — Phase 4

1. **各產品線 Datasheet 內容確認與排版優化**
   - AP 需額外加入 Radio Pattern 圖片區塊
   - 各產品線的 cover page 排版可能因內容量不同需微調
2. **Web Overview 欄位統一** — 已完成 Sheet 端調整，程式端 parser 待更新為精確匹配
3. **多國語言版 Datasheet** — 執行方式待討論
4. **產品照片命名整理** — 統一所有產品線的圖片檔命名規則

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
