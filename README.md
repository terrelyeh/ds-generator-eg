# Product SpecHub

EnGenius 產品規格管理與 Datasheet 自動化系統。從 Google Sheets 同步產品資料，提供規格比較、變更追蹤，並生成可列印的 PDF Datasheet。

## Features

### Dashboard
- 產品線 tab 切換（Cloud AP / Cloud Switch / Cloud Camera）
- 產品清單：Model、版本、圖片狀態、Radio Pattern（AP）、最後編輯資訊
- Navbar 一鍵同步所有產品線資料
- Breadcrumb 導覽路徑貫穿所有子頁面

### Product Detail
- Overview & Key Features（從 Google Sheets 同步）
- 完整規格表（分類 header + zebra striping）
- 產品圖片管理（自動同步 + 手動上傳）
- 版本紀錄與 PDF 下載

### Spec Comparison
- 跨 model 規格比較表（支援 24+ model 橫向滾動）
- 全域搜尋、欄位排序、Column 顯示/隱藏
- Sticky header + pinned Category/Spec 欄位

### Change Log
- Structured diff 表格（Field / From / To / Type）
- Revision Log 參考紀錄

### Datasheet PDF
- Cover page：產品圖、Overview、Features
- Technical Specifications（自動分頁）
- Hardware Overview
- 支援 browser Save as PDF 與 server-side Puppeteer 生成

### Internal Docs
- `/docs/sync` — 資料同步與通知機制說明頁（從 Dashboard footer 連結）

### Automated Sync
- 每日 09:00（台灣時間）自動同步 Google Sheets → Supabase
- Smart Sync：比對 Google Drive `modifiedTime`，未變動則跳過
- 變更偵測：field-level + spec-level + comparison table deep diff
- Telegram 通知：按產品線分組的精簡摘要格式

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| UI | Tailwind CSS v4 + shadcn/ui |
| Table | @tanstack/react-table |
| Database | Supabase (PostgreSQL + Storage) |
| Data Source | Google Sheets API + Drive API |
| PDF | Puppeteer + Browser Print |
| Deployment | Vercel + Vercel Cron |
| Notifications | Telegram Bot API |

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Fill in Supabase, Google, Telegram credentials

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the dashboard.

## Product Lines

| Name | Products | Google Sheet Tabs |
|---|---|---|
| Cloud Access Points | ECW115, ECW536, etc. | Web Overview, Detail Specs, Comparison, Revision Log |
| Cloud Managed Switches | ECS1008P, ECS2512FP, etc. | Same structure |
| AI Cloud Cameras | ECC100, ECC500, etc. | Same structure |

## Deployment

Deployed on Vercel with automatic deploys from `main` branch.

- **Cron Job**: Daily at 01:00 UTC (09:00 Taiwan) via `vercel.json`
- **Manual Sync**: Dashboard "Sync from Sheets" button

## Environment Variables

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key (bypasses RLS) |
| `SUPABASE_ANON_KEY` | Supabase public key |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google API service account JSON (base64) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token for notifications |
| `TELEGRAM_CHAT_ID` | Telegram chat/group ID |
| `CRON_SECRET` | Secret for Vercel Cron authorization |
