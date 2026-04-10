# CLAUDE.md — Project Context

> Last updated: 2026-04-11

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

## Next.js 16 Breaking Changes (IMPORTANT)

- `params` and `searchParams` are **Promises** — must be awaited
- `cookies()` and `headers()` are **async** — must be awaited
- Fetch requests are **not cached by default**
- Server Components are the default; use `'use client'` for state/hooks/events

## Directory Structure

```
src/
  app/
    (main)/                    # Route group: pages with Navbar + Solution sidebar
      dashboard/
        page.tsx               # Redirect → /dashboard/{first-solution}
        layout.tsx             # Solution sidebar + content area
        [solution]/page.tsx    # Per-solution dashboard (reads ?line= for tab)
        [solution]/loading.tsx # Skeleton
      compare/[line]/page.tsx
      changelog/[line]/page.tsx
      product/[model]/page.tsx  # Product detail (sticky header, images, specs, versions)
    (print)/
      preview/[model]/page.tsx # Datasheet HTML preview (blue/gray theme)
    api/sync/route.ts          # Google Sheets → Supabase sync (per-line or all)
    api/generate-pdf/route.ts  # Puppeteer PDF: regenerate or new version mode
    api/upload-image/route.ts  # Upload to Supabase + Google Drive (product/hardware/radio_pattern)
  components/
    layout/
      navbar.tsx               # Top navbar (no sync button — moved to dashboard)
      solution-sidebar.tsx     # Collapsible left sidebar with solution icons
    dashboard/dashboard-content.tsx  # Tabs, per-line sync, product table
    product/product-detail.tsx # Sticky header, image upload, radio pattern slots, version dropdown
    preview/print-toolbar.tsx  # Regenerate/New Version + Print Draft
    compare/compare-table.tsx
    ui/
  lib/
    google/sheets.ts           # Parse Web Overview (incl. Status) + Detail Specs
    google/sheets-extra.ts     # Parse Revision Log, Comparison, Cloud Comparison
    google/drive-images.ts     # Sync images Drive↔Storage + uploadImageToDrive()
    google/drive-versions.ts   # detectLatestVersion() + bumpVersion() + uploadPdfToDrive()
    google/auth.ts             # Service account auth (drive scope = read/write)
    supabase/admin.ts
    supabase/server.ts
    datasheet/pagination.ts
    notifications/index.ts
  types/database.ts            # Supabase DB types (incl. solutions table)
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
- `products` — status (active/upcoming/pending), current_version
- `versions` — version, pdf_storage_path, changes, generated_at（per-model PDF history）
- `change_logs` — per-product content diff history（Dashboard "Last Changed" 從這裡取）
- `image_assets` — radio_pattern 多張圖（label: "2.4G H-plane" 等）

## Conventions

- Supabase query builders 是 **PromiseLike** 但不是完整 Promise → 要用 `as { data: T | null }`
- PDF preview 用 inline `<style>` + absolute positioning 排版，不用 Tailwind
- Loading states 用 `loading.tsx` skeleton pattern
- Drive 資料夾結構與命名規則詳見 [`docs/drive-folder-and-naming-rules.md`](docs/drive-folder-and-naming-rules.md)

### UI Layout Conventions

- **Dashboard 兩行 toolbar**: Row 1 = product line tabs (`text-xs whitespace-nowrap`)；Row 2 = Active toggle | Compare Changelog | Sync（文字連結風格，pipe 分隔）
- **Product page sticky header**: `sticky top-14 z-20` — model name + version badge + buttons 固定
- **Breadcrumb**: 簡化為 `[ProductLine] / [Model]`，ProductLine 連結帶 `?line=` 回正確 tab
- **Dashboard 表格欄位**: #, Model#, Model Name(w-56), Version, Last Changed, OV, FT, Prod, HW, [Radio Pattern], Actions
- **Solution sidebar**: 預設收合（`collapsed: true`），只顯示 icon
- **Datasheet 佈景**: Cloud = 藍色 `#03a9f4`，Unmanaged = 灰色 `#58595B`（由 `product_lines.category` 判斷）

## Current Status

功能清單詳見 [README.md](README.md)。

### 🔜 Next Steps

1. **多國語言 Datasheet** — 即將討論架構
2. **產品照片補齊** — Cloud VPN FW（4 models 全部缺圖）優先，AP 需 radio pattern
3. **多張 Hardware 圖支援** — 部分型號需 front/rear/bottom 最多 3 張，已討論命名規則但尚未實作
4. **Drive 版本 bulk update** — AP/SW 產品線的版本尚未用新的 3-layer 偵測邏輯更新
5. **NVS 命名不一致** — Drive 用 "NVS" prefix，系統 model 用 "EVS"，需解決
6. **Extender/Unmgd SW 的 ds_prefix** — Unmanaged 實際 PDF 用 `DS_Unmanaged_Switch_ES105`（中間有 Switch），但 ds_prefix 設為 `DS_Unmanaged`

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
