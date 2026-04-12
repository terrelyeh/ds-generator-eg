# Product SpecHub

EnGenius 產品規格管理與 Datasheet 自動化系統。從 Google Sheets 同步產品資料，提供規格比較、變更追蹤，並生成可列印的 PDF Datasheet。

## Features

### Dashboard
- **7 個產品線** tab 切換（Cloud AP / SW / Camera / NVS / VPN FW / Extender / Unmgd SW）
- **Solution sidebar**（可收合）— 支援多 Solution 架構擴展
- 產品清單：Model、版本、OV/FT/Prod/HW 就緒狀態、Radio Pattern（AP）
- **Per-line Sync** — 只同步當前產品線，toast 顯示詳細同步結果
- 產品線 tab 有獨立 URL（reload 不跳回第一個 tab）
- **Product Status**：Active / Upcoming / Pending 篩選與 badge 顯示

### Product Detail
- **Sticky header** — 下拉時 Model 名稱、版本、按鈕固定在頂部
- Overview & Key Features（從 Google Sheets 同步）
- 完整規格表（分類 header + zebra striping）
- **圖片雙向管理** — 上傳到 Supabase + 自動同步到 Google Drive，自動重新命名
- **Radio Pattern**（AP 專用）— 2.4G/5G/6G H-plane & E-plane 圖片 placeholder + 上傳
- **Regenerate / New Version** 兩種 PDF 生成模式
- 版本紀錄與 PDF 下載
- Generate PDF 前置條件檢查（需 Product Image + Hardware Image + Overview + Features）

### Spec Comparison
- 跨 model 規格比較表（支援 24+ model 橫向滾動）
- 全域搜尋、欄位排序、Column 顯示/隱藏
- Sticky header + pinned Category/Spec 欄位

### Datasheet PDF
- Cover page：產品圖、Overview、Features
- Technical Specifications（自動分頁）
- Hardware Overview + QR Code footer
- **Cloud 藍色 / Unmanaged 灰色** 雙主題
- **Regenerate**（覆蓋當前版本）vs **New Version**（版本 +1）
- Preview toolbar + Model page 都有相同的版本控制

### Multi-Language Datasheet
- **日文 / 繁體中文** 翻譯支援（可擴展更多語言）
- 選擇性啟用：每個型號獨立決定需不需要多語言版本
- **兩種翻譯模式**：Light（標題+內容）/ Full（+規格表 label）
- **AI 翻譯**：支援 Claude、GPT-4o、Gemini，翻譯同時改善原文品質
- **翻譯筆記**：AI 翻譯後顯示做了哪些優化的中文說明
- **翻譯詞庫**（Glossary）：公司級術語字典，AI 自動遵循
- **Draft / Confirmed 流程**：Preview 可隨時預覽，Save & Confirm 後才能生成 PDF
- 每個語言版本號獨立管理，Drive 獨立資料夾
- CJK 排版優化：禁則處理、兩端對齊、per-locale 專用字型
- 語言專屬 Hardware Image 支援（不同語言的標註圖）
- Headline 支援 `**粗體**` 標記，可手動斷行
- Subtitle 可按語言覆寫
- QR Code 標籤和連結可按語言自訂

### Settings
- **Settings 導航頁** — 三個獨立管理區塊，各自獨立頁面
- **API Key 管理**（`/settings/api-keys`）— 設定 AI 翻譯 API Key，存到 DB，優先於 Vercel env var
- **翻譯詞庫**（`/settings/glossary`）— 公司認可翻譯術語，分 Global 和產品線專屬
- **Typography**（`/settings/typography`）— 每個語言獨立的字型、字級、字重設定
  - Google Font 選擇器（預設 + 自定義 URL 添加）
  - Split layout：左設定、右即時 Datasheet Preview（可縮放）
  - 分組欄位：Headline / Overview / Features / Specifications / Footer

### Automated Sync
- 每日 09:00（台灣時間）自動同步 Google Sheets → Supabase
- Smart Sync：比對 Google Drive `modifiedTime`，未變動則跳過
- 自動偵測並補齊缺失的產品圖片
- 變更偵測：field-level + spec-level + status + comparison table deep diff
- Telegram 通知：按產品線分組的精簡摘要格式

### Documentation
- `/docs/sync` — 資料同步與通知機制說明頁
- `/docs/drive-folder-and-naming-rules.html` — Drive 資料夾結構與命名規則（含 left panel TOC）

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| UI | Tailwind CSS v4 + shadcn/ui |
| Table | @tanstack/react-table |
| Database | Supabase (PostgreSQL + Storage) |
| Data Source | Google Sheets API + Drive API |
| PDF | Puppeteer + Browser Print |
| AI Translation | Claude / GPT-4o / Gemini (multi-provider) |
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

## Product Lines (EnGenius Cloud)

| Product Line | Label | Models | Theme |
|---|---|---|---|
| Cloud AP | Cloud AP | ECW115, ECW526, ECW536, etc. (25) | Blue |
| Cloud Switch | Cloud SW | ECS1112FP, ECS5512FP, etc. (21) | Blue |
| Cloud Camera | Cloud Camera | ECC100, ECC500, etc. (7) | Blue |
| Cloud AI-NVS | Cloud NVS | EVS1002D, EVS1004D, EVS3004U (3) | Blue |
| Cloud VPN Firewall | Cloud VPN FW | ESG320, ESG510, ESG610, ESG620 (4) | Blue |
| Switch Extender | Extender | EXT1105P, EXT1106, EXT1109P (3) | Blue |
| Unmanaged Switch | Unmgd SW | ES105, ES108, ES110FP (3) | Gray |

Future Solutions: EnGenius Fit, Broadband Outdoor, Network Management, Accessories, Data Center, Legacy

## Deployment

Deployed on Vercel with automatic deploys from `main` branch.

- **Cron Job**: Daily at 01:00 UTC (09:00 Taiwan) via `vercel.json`
- **Manual Sync**: Dashboard per-line "Sync" button

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
| `ANTHROPIC_API_KEY` | (Optional) Anthropic API key for Claude translation |
| `OPENAI_API_KEY` | (Optional) OpenAI API key for GPT-4o translation |
| `GOOGLE_AI_API_KEY` | (Optional) Google AI API key for Gemini translation |

> AI translation API keys can also be configured via the Settings page (stored in DB, takes priority over env vars).
