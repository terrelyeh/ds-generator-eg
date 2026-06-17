# Product SpecHub

EnGenius 產品規格管理與 Datasheet 自動化系統。從 Google Sheets 同步產品資料，提供規格比較、變更追蹤，並生成可列印的 PDF Datasheet。

## Features

### Dashboard
- **多產品線 / 多 Solution** tab 切換（Cloud 7 條線 + Accessories ▸ Transceiver）
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
- **QSG URL 預覽** — Detail 頁顯示這個 model 印在 PDF 上的 QR Code 將指向哪個連結，含 Copy / Test 按鈕（admin/editor only）
- **Regenerate / New Version** 兩種 PDF 生成模式
- 版本紀錄與 PDF 下載
- Generate PDF 前置條件檢查（需 Product Image + Overview + Features + Hardware Image；**Transceiver 無 Hardware Image，不檢查**）

### Spec Comparison
- 跨 model 規格比較表（支援 24+ model 橫向滾動）
- 全域搜尋、欄位排序、Column 顯示/隱藏
- Sticky header + pinned Category/Spec 欄位

### Competitor Battlecard（內部競品比較）
- **EnGenius 機型 vs 競品 並排比較表**，供業務/PM 內部參考（Cloud AP / Camera / Switch / L3 Switch）
- **依錨點機型分頁**切換，每張表把自家機型對上各競品（Ubiquiti / Cisco Meraki / TP-Link 等）
- **Tier 分級（T1/T2/T3）是「相對於某台自家機型」** — 同一台競品對不同自家機型可標不同 tier
- **半自動填規格、PM 確認制**：競品規格由 AI 抓取，先以「草稿」（琥珀色）呈現、附來源連結，PM 核對後 **Save & Confirm** 才生效（亦可「一鍵確認整表」）
  - **↻ sync**：抓競品**官方 datasheet** 更新
  - **🔍 web**：**全網搜尋**只補目前空白的規格（補官方 datasheet 沒有的）
- **競品管理**：可自行新增競品品牌 / 型號 / 對戰機型 / tier / datasheet 連結，改 tier 或移除
- 純內部使用，不會印在對外 datasheet 上

### Datasheet PDF
- Cover page：產品圖、Overview、Features（**動態版面** — features 依內容浮動，overview 自動吃剩下空間）
- Technical Specifications（自動分頁，2 欄按高度平衡；同一 category 跨欄不重複 header；規格 value 太長自動切行並加 "(cont.)" 續接）
- **規格表備註區**（per-product-line, optional）— VPN Firewall 等產品線可在最後一頁 spec 下方放免責備註（如 `*Note: Performance figures are estimates…`），支援多語言
- **Antennas Patterns**（AP 專用）— 上傳 radio pattern 圖後，PDF 自動新增一頁顯示 2.4G / 5G / 6G H-Plane & E-Plane polar plots
- Hardware Overview + QR Code footer（QR URL 解析優先序：per-product → per-product-line template → 預設短連結）
- **依產品線主題**：Cloud 藍色 / Unmanaged·Extender 灰色 / **Transceiver 綠色**
- **Transceiver 變體**（Accessories）— 封面照片置中 + Overview 滿版、**無 Hardware 頁**、QR 指向 **Contact Us**（無 QSG）
- **Regenerate**（覆蓋當前版本）vs **New Version**（版本 +1）
- Preview toolbar + Model page 都有相同的版本控制
- **Drive 自動建資料夾** — 第一次產 zh / ja PDF 時自動建立 `Cloud Camera_zh` / `Cloud Camera_ja` 等 sibling 資料夾（PM 不需要事先手動建）
- **Drive 重複自動清** — Regenerate 時偵測同名舊檔自動覆蓋 + 移到垃圾桶清掉重複版本
- **Toast 通知** — 生成中／完成／失敗都有即時 toast，完成後一鍵「Open PDF」開新分頁
- **Draft 翻譯不能產官方 PDF** — 翻譯狀態還是 Draft 時 Regenerate 按鈕停用，強迫先 Save & Confirm 再產
- **角色限制** — PM / Viewer 收到 preview 連結時看得到內容但**沒有 Regenerate 按鈕**，只有 Editor / Admin 可以產官方 PDF

### Layout Overflow Detection
- **跑版預警** — Dashboard 和 Product Detail 自動偵測 overview/features/spec 會不會超過版面容納範圍，紅燈提示 PM 要精簡
- **逐語言檢查** — 英/日/繁中各自用該語言的字級、行高、每行字數估算（CJK 字比較大，同樣內容更可能跑版）
- **Mark as Reviewed OK** — PM 目視確認 PDF 沒問題後可以把紅燈壓綠，確認會和當下內容綁定；之後內容一改確認自動失效、紅燈回來
- **Undo** — 隨時可以取消確認恢復紅燈

### Multi-Language Datasheet
- **日文 / 繁體中文** 翻譯支援（可擴展更多語言）
- 選擇性啟用：每個型號獨立決定需不需要多語言版本
- **兩種翻譯模式**：Light（標題+內容）/ Full（+規格表 label）
- **AI 翻譯**：支援 Claude、GPT-4o、Gemini，翻譯同時改善原文品質
- **翻譯筆記**：AI 翻譯後顯示做了哪些優化的中文說明
- **翻譯詞庫**（Glossary）：公司級術語字典，AI 自動遵循
- **Draft / Confirmed 流程**：Preview 隨時可預覽（自動存草稿），Save & Confirm 後才能生成 PDF。Draft 狀態下 Save 按鈕用 amber pulse 視覺強調 + Preview 跳 toast 提醒「請按 Save & Confirm」，避免使用者卡在 Draft 出不來
- 每個語言版本號獨立管理，Drive 獨立資料夾
- CJK 排版優化：禁則處理、兩端對齊、per-locale 專用字型
- 語言專屬 Hardware Image 支援（不同語言的標註圖）
- Headline 支援 `**粗體**` 標記，可手動斷行
- Subtitle 可按語言覆寫
- QR Code 標籤和連結可按語言自訂

### Ask / Knowledge / Search API — 已移至 EnGenie

SpecHub 原本的 **AI 問答（Ask）、知識庫索引管理（Knowledge Base）、部門聊天 workspaces、對外 RAG Search API、各國 WiFi 法規檢視**，已全部析出到獨立的 **[EnGenie](../engenie/README.md)** app（monorepo Phase 3–4）。SpecHub 站內問答現在改用右下角嵌入 EnGenie 的浮動 widget。

→ 功能全貌見 **[EnGenie README](../engenie/README.md)**；RAG / Ask / 知識庫的技術細節見 [apps/engenie/CLAUDE.md](../engenie/CLAUDE.md)。

### Settings
- **翻譯詞庫**（`/settings/glossary`）— 公司認可翻譯術語，分 Global 和產品線專屬
- **Typography**（`/settings/typography`）— 每個語言獨立的字型、字級、字重設定
  - Google Font 選擇器（預設 + 自定義 URL 添加）
  - Split layout：左設定、右即時 Datasheet Preview（可縮放）
- **Users**（`/settings/users`）— 邀請 / 移除使用者、改 role（admin only）
- **AI Provider Keys / Ask Personas 已移至 [EnGenie](../engenie/README.md)**（settings 首頁有連結卡）；SpecHub 翻譯 runtime 直接讀共用的 `app_settings`

### Access Control
- **Google OAuth 登入** — 走 Supabase Auth + PKCE flow，不需要密碼
- **Email 白名單** — admin 預先邀請 email，使用者首次登入自動建 profile
- **4 種角色**：
  - **Admin** — 完整存取（含使用者管理 / API Key / Ask Personas 等所有 Settings）
  - **Editor (MKT)** — 編輯內容、Sync、產 PDF、翻譯，**可管理翻譯詞庫 + Typography 設定**
  - **PM** — 純瀏覽（review-only，未來會加 content approval workflow）
  - **Viewer** — 純瀏覽 + Ask SpecHub（業務 / Field 用）
- **三層 enforcement**：API gate（403 by role）、Server page guard（redirect 未授權）、UI hide（按鈕隱藏）
- **使用者管理 UI** — Active Users / Pending Invites tabs、邀請表單、role 下拉、移除按鈕、自我保護（不能改自己 role / 不能移除最後一個 admin）
- **自動 Session refresh** — Supabase access token 1 小時過期由 proxy 透明續期
- **Cron / Service routes 例外** — `/api/sync` 透過 Vercel `x-vercel-cron` header 識別，不需登入

### Concurrency Protection
- **PDF 生成鎖** — 同一 model + locale 同時只能一人生成，DB flag 自動 5 分鐘過期
- **Settings 樂觀鎖** — Typography / API Keys / Glossary 儲存時比對 `updated_at`，衝突回 409

### Automated Sync
- 每日 09:00（台灣時間）自動同步 Google Sheets → Supabase
- Smart Sync：比對 Google Drive `modifiedTime`，未變動則跳過
- 自動偵測並補齊缺失的產品圖片
- 變更偵測：field-level + spec-level + status + comparison table deep diff
- **Auto Re-index RAG**：sync 完成後自動重建有變動 product 的向量索引，讓 Ask SpecHub 馬上能回答新內容
- **Resync versions from Drive**（Dashboard `Sync ▾` 選項）— 一鍵重新掃 Drive 把 DB 版號拉到跟實際 PDF 一致，PM 手動動 Drive 後可修正
- Telegram 通知：按產品線分組的精簡摘要格式

### Documentation
- `/docs/sync` — 資料同步與通知機制說明頁
- `/docs/drive-folder-and-naming-rules.html` — Drive 資料夾結構與命名規則（含 left panel TOC）
- `/docs/rag-system.html` — Ask SpecHub RAG 系統完整說明（含 left panel TOC）
- `/docs/ask-integration.html` — Ask Workspace 部門整合服務介紹（公開、可分享）
- `/docs/widget-demo.html` — 浮動 widget 展示頁（假資料示意，含活的 widget）
- `/docs/api-search.html` — 對外 RAG Search API 串接規格

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| UI | Tailwind CSS v4 + shadcn/ui |
| Table | @tanstack/react-table |
| Database | Supabase (PostgreSQL + Storage) |
| Auth | Supabase Auth + Google OAuth + DB whitelist + 4-role RBAC |
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

## Product Lines

| Product Line | Label | Models | Theme |
|---|---|---|---|
| Cloud AP | Cloud AP | ECW115, ECW526, ECW536, etc. (25) | Blue |
| Cloud Switch | Cloud SW | ECS1112FP, ECS5512FP, etc. (21) | Blue |
| Cloud Camera | Cloud Camera | ECC100, ECC500, etc. (7) | Blue |
| Cloud AI-NVS | Cloud NVS | EVS1002D, EVS1004D, EVS3004U (3) | Blue |
| Cloud VPN Firewall | Cloud VPN FW | ESG320, ESG510, ESG610, ESG620 (4) | Blue |
| Switch Extender | Extender | EXT1105P, EXT1106, EXT1109P (3) | Blue |
| Unmanaged Switch | Unmgd SW | ES105, ES108, ES110FP (3) | Gray |
| Transceiver *(Accessories)* | Transceiver | SFP / QSFP / DAC (13) | **Green** |

Cloud lines above belong to the **EnGenius Cloud** solution; **Transceiver** is the first
line under the **Accessories** solution (green theme, single product image, no hardware page).

Future Solutions: EnGenius Fit, Broadband Outdoor, Network Management, Data Center, Legacy

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
| `API_KEY_ENC_SECRET` | Encrypts stored API keys + (fallback) signs workspace/widget session tokens |
| `WORKSPACE_TOKEN_SECRET` | (Optional) Dedicated signing key for workspace/widget session tokens; falls back to `API_KEY_ENC_SECRET` if unset |

> Optional API keys can also be configured via Settings > API Keys (stored in DB, takes priority over env vars).
