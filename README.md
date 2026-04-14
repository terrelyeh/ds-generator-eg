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

### Ask SpecHub (RAG)
- **AI 產品規格查詢** — 用自然語言（中文/英文）詢問產品規格、比較、推薦、法規
- **向量搜尋** — pgvector + OpenAI Embedding，語意搜尋而非關鍵字匹配
- **多 AI 模型** — Gemini（Pro/Flash/Lite）、GPT（4o/4o-mini/Nano）、Claude（Opus/Sonnet/Haiku），可即時切換比較
- **三維度 Prompt 架構**：
  - **回答角度**（Persona）— 3 個內建角色（Product Specialist / Sales Assistant / Technical Support），可自訂
  - **對話對象**（User Profile）— 4 種角色（同事 / 業務·Channel / 產品經理 / 終端客戶）
  - **產出格式**（規劃中）— 未來支援生成簡報、比較表、Email 草稿
- **跨語言智慧檢索** — 中文問題問英文文件也能精準命中；偵測到型號（ECW536）或國家（台灣）時自動補查 + 重新排序
- **對話持久化** — 對話自動存入 DB，側邊欄歷史列表，可恢復 / 批次刪除
- **Markdown 渲染** — 表格、列表、粗體等格式化回答
- **來源引用 + 延伸問題** — 回答附上可點擊的來源連結（Gitbook / Help Center / Google Doc / WiFi Regulations），並生成 3 個延伸問題
- **複製按鈕** — 一鍵複製回答內容（保留 Markdown 格式）

### Knowledge Base
- **索引管理**（`/knowledge`）— 查看已索引的內容、source 數量、chunk 數、token 數
- **5 種已實作來源類型**：
  - **Product Specs** — 66 product × 2 chunks，從 DB 自動 tag taxonomy
  - **Gitbook Docs** — 含 Vision API 圖片描述；QSG 空間會自動抽出 **LED behavior table** 成為專屬 chunks
  - **Help Center** — Intercom 技術文章（含 Type-level Re-index All 按鈕）
  - **Google Docs** — Drive API 或公開連結；per-row **Sync** 按鈕一鍵重抓
  - **WiFi Regulations** — 93 國 WiFi 法規資料（頻段、頻道、功率、DFS），來自 EnGenius WiFi RegHub API
- **統一 Taxonomy（Solution > Product Line > Model）** — 所有 source 共用的三層分類。Ask 查詢時可以按任一層 filter，未指定 product line 的內容自動套用整個 solution
- **Edit Taxonomy** — 每個 source 都有 Edit 按鈕，可事後補 tag 而不用重跑 ingest
- **Re-index / Force Re-index / Delete** — 按來源類型管理
- **Last Indexed 時間** — 每個來源顯示最後索引時間

### WiFi Regulation Viewer
- **`/wifi-regulation/[code]`** — 單一國家法規的乾淨 markdown 頁面（UNII 頻段、頻道清單、功率限制、DFS 要求）
- Ask SpecHub 的法規引用會直接連到此頁面

### Settings
- **Settings 導航頁** — 四個獨立管理區塊，各自獨立頁面
- **API Key 管理**（`/settings/api-keys`）— 設定 AI API Key（Embedding + 翻譯 + RAG），存到 DB
- **翻譯詞庫**（`/settings/glossary`）— 公司認可翻譯術語，分 Global 和產品線專屬
- **Typography**（`/settings/typography`）— 每個語言獨立的字型、字級、字重設定
  - Google Font 選擇器（預設 + 自定義 URL 添加）
  - Split layout：左設定、右即時 Datasheet Preview（可縮放）
- **Ask Personas**（`/settings/personas`）— 管理 AI 問答的 system prompt

### Concurrency Protection
- **PDF 生成鎖** — 同一 model + locale 同時只能一人生成，DB flag 自動 5 分鐘過期
- **Settings 樂觀鎖** — Typography / API Keys / Glossary 儲存時比對 `updated_at`，衝突回 409

### Automated Sync
- 每日 09:00（台灣時間）自動同步 Google Sheets → Supabase
- Smart Sync：比對 Google Drive `modifiedTime`，未變動則跳過
- 自動偵測並補齊缺失的產品圖片
- 變更偵測：field-level + spec-level + status + comparison table deep diff
- **Auto Re-index RAG**：sync 完成後自動重建有變動 product 的向量索引，讓 Ask SpecHub 馬上能回答新內容
- Telegram 通知：按產品線分組的精簡摘要格式

### Documentation
- `/docs/sync` — 資料同步與通知機制說明頁
- `/docs/drive-folder-and-naming-rules.html` — Drive 資料夾結構與命名規則（含 left panel TOC）
- `/docs/rag-system.html` — Ask SpecHub RAG 系統完整說明（含 left panel TOC）

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
| RAG / Vector Search | pgvector + OpenAI Embedding + react-markdown |
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
| `OPENAI_API_KEY` | (Optional) OpenAI API key for GPT-4o translation + RAG embeddings |
| `GOOGLE_AI_API_KEY` | (Optional) Google AI API key for Gemini translation + Vision |
| `WIFI_REGHUB_API_KEY` | (Optional) EnGenius WiFi RegHub API key for wifi_regulation source type |

> Optional API keys can also be configured via Settings > API Keys (stored in DB, takes priority over env vars).
