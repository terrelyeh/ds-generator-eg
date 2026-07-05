# EnGenie

EnGenius 公司知識平台 — 把產品規格、技術文件、法規等知識索引成向量資料庫，提供自然語言 AI 問答（Ask）、部門專屬聊天入口（整頁 / 嵌入式 widget），以及給其他部門 app 串接的對外 RAG Search API。

> Monorepo 的一員（與 [Product SpecHub](../spechub/README.md) 共用同一個 Supabase）。開發者請先讀 [CLAUDE.md](CLAUDE.md)。

## Features

### Ask — AI 知識問答（RAG）
- **自然語言查詢** — 用中文 / 英文 / 日文問產品規格、比較、設定、推薦、法規，答案以公司自有知識庫為依據（不靠模型的泛用知識）
- **向量語意搜尋** — pgvector + OpenAI Embedding，語意命中而非關鍵字匹配
- **多 AI 模型即時切換** — Gemini（Pro / Flash / Lite）、GPT、Claude（Opus / Sonnet / Haiku）三大家族
- **跨語言檢索** — 中文問題也能精準命中英文文件；偵測到型號（ECW536）或國家（台灣）時自動補查 + 重新排序
- **三維度 Prompt** — 回答角度（Persona）、對話對象（User Profile）、產出格式（規劃中）
- **快速回覆** — 首字約 2–3 秒（平行檢索 + 熱路徑快取 + Flash 免思考）；來源卡片在答案生成前就先出現，不用乾等
- **ChatGPT 級體驗** — 平順串流 + 即時狀態（「搜尋中…」→「整理回覆中…」）、可隨時停止 / 重新生成；往上讀歷史不會被拉回底部
- **Markdown 渲染** — 表格、清單、程式碼區塊（語法高亮 + 複製）；回答會主動用表格做產品比較、粗體標出型號與規格
- **來源引用 + 延伸問題** — 附可點擊的來源連結，並生成 3 個「自包」的延伸追問
- **對話持久化** — 自動存 DB、側邊欄歷史、可恢復 / 批次刪除

### Ask Workspaces — 部門專屬聊天入口
同一套知識庫，三種對外形式任選或並用：

- **整頁入口** `/ask/<slug>` — 每個部門自己的 Ask 聊天頁，免登入（passcode 進入）
- **嵌入式浮動 widget** — 像 Intercom 右下角的聊天泡泡，貼一段 `<script>` 即可放進任何網站；樣式隔離、手機自動全螢幕、跨站安全（token 認證，不靠第三方 cookie）
- **Search API** — 機器對機器的 JSON 檢索（見下方）

其他特性：
- **共用知識庫、各自範圍** — 用 taxonomy（Solution / Product Line）+ 來源類型 scope 限定每個 workspace 看得到的內容
- **LLM 三種模式** — `共用 key + 配額`（公司出錢、可設每分 / 每日上限）、`Workspace BYOK`（整個 workspace 一把 key）、`User BYOK`（使用者自己在前台輸入、只存在他的瀏覽器）
- **可自訂歡迎畫面** — 每個 workspace 自己的 persona / 對話對象 / 歡迎語 / **範例問題（最多 6 個，按產品線、設定、比較、法規等不同意圖設計）**
- **嵌入安全** — 每個 workspace 可設「允許嵌入的網域」白名單；可一鍵「撤銷連線」讓所有已發出的 token 立即失效

### Knowledge Base — 知識索引管理（`/knowledge`）
- **8 種來源類型**：
  - **Product Specs** — 從 DB 自動 tag taxonomy 的產品規格（overview + 規格）
  - **Gitbook Docs** — 含 Vision API 圖片描述；QSG 自動抽出 LED behavior table
  - **Help Center** — Intercom 技術文章
  - **Google Docs** — Drive API 或公開連結，per-row 一鍵重抓
  - **WiFi Regulations** — 各國 WiFi 法規（頻段、頻道、功率、DFS），來自 EnGenius WiFi RegHub
  - **Web Pages** — 貼任意網址即索引（Firecrawl → Jina → fetch 層疊萃取）
  - **Text Snippets** — 手動文字片段（FAQ、競品比較、標準答案），Markdown 編輯
  - **Files (PDF)** — 上傳 PDF 由 AI（Gemini）讀取：表格轉 Markdown、圖表描述、掃描檔 OCR
- **統一 Taxonomy（Solution > Product Line > Model）** — 所有來源共用的三層分類；Ask 查詢可按任一層 filter
- **Product Specs 分組瀏覽** — 型號清單依 **Solution ▸ Product Line 折疊分組**、可搜尋（型號 / 標題）、**每條產品線各自 Re-index**，量大也好管理
- **Edit Taxonomy** — 每個來源都能事後補 tag，不用重跑 ingest
- **Re-index / Force Re-index / Delete** — 按來源類型或產品線管理；每個來源顯示最後索引時間

### 對外 RAG Search API（其他部門串接）
- **`POST /api/v1/search`** — 讓其他部門的 app 查詢知識庫、取得最相關片段，接進自己的 LLM
- **Scoped API key** — 管理員在 `/settings/api-access` 核發 key，可限定 Solution / 產品線 / 來源類型範圍與每分鐘速率
- **Claude Code Skill（`/engenius-kb`）** — 用 Claude Code 的同事可一行安裝 skill，讓 AI 直接查 EnGenius 知識庫回答
- 完整串接文件見 [`docs/api-search.md`](docs/api-search.md)（線上：`/docs/api-search.html`）

### WiFi Regulation Viewer
- **`/wifi-regulation/[code]`** — 單一國家法規的乾淨 markdown 頁面（UNII 頻段、頻道、功率限制、DFS）；Ask 的法規引用會直接連到此頁

### Settings
- **Ask Workspaces**（`/settings/ask-workspaces`）— 發 / 編部門 workspace、設範圍與上限、複製入口連結或 Embed snippet
- **Ask Personas**（`/settings/personas`）— 管理 AI 問答的 system prompt（角色）
- **Ask Welcome**（`/settings/ask-welcome`）— 自訂內部 Ask 的歡迎語、說明、範例問題
- **API Access**（`/settings/api-access`）— 核發 / 管理對外 Search API key + skill 安裝指引
- **AI Provider API Keys**（`/settings/api-keys`）— Claude / GPT / Gemini 的 key（存共用 `app_settings`，供 Ask 回答、RAG embedding、SpecHub 翻譯共用）

### Access Control
- **Google OAuth 登入** + Email 白名單 + 4 種角色（Admin / Editor / PM / Viewer），與 SpecHub 共用同一套 RBAC（`@eg/auth`）
- 公開區（demo / workspace / widget / 設計文件）走各自的 passcode / token gate，不需公司登入
- **暴力猜測防護** — demo / workspace passcode 端點依 IP 限流（每 5 分鐘 10 次）
- **對話隱私** — Ask 歷史綁定登入者，各自只看得到自己的對話

### Design Docs（公開、可分享）
- [`/docs/ask-integration.html`](https://engenie-eg.vercel.app/docs/ask-integration.html) — 整合服務總覽（EnGenie 回答 vs 呼叫端的腦兩種家族）
- [`/docs/agent-architecture.html`](https://engenie-eg.vercel.app/docs/agent-architecture.html) — 單一 agent 設計提案（工具導向）
- [`/docs/multi-agent-architecture.html`](https://engenie-eg.vercel.app/docs/multi-agent-architecture.html) — 多 agent 架構（topology / 上下文傳遞）
- [`/docs/engenie-knowledge-mcp.html`](https://engenie-eg.vercel.app/docs/engenie-knowledge-mcp.html) — 把知識庫包成 MCP server 的設計草案

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| UI | Tailwind CSS v4 + shadcn/ui |
| Database | Supabase (PostgreSQL + Storage)，與 SpecHub 共用 |
| Vector Search | pgvector (HNSW) + OpenAI Embedding (`text-embedding-3-small`) |
| LLM | Claude / GPT / Gemini（multi-provider，可即時切換） |
| Chat Rendering | react-markdown + remark-gfm + highlight.js |
| Auth | Supabase Auth + Google OAuth + DB whitelist + 4-role RBAC（`@eg/auth`） |
| Deployment | Vercel（專案 `engenie-eg`）+ Vercel Cron + GitHub Actions |

## Getting Started

```bash
# 在 monorepo 根目錄安裝依賴
npm install

# 設定環境變數
cp apps/engenie/.env.example apps/engenie/.env.local
# 填入 Supabase、加密 secret、demo passcode（LLM keys 改在 Settings 設定，不放 env）

# 啟動開發伺服器（engenie 用 port 3100）
npm run dev -w engenie
```

開啟 [http://localhost:3100](http://localhost:3100)。LLM key 也可以在 `/settings/api-keys` 設定（存 DB，優先於 env）。

## Deployment

- Vercel 專案 `engenie-eg`，Root Directory `apps/engenie`，function region 釘 **`hnd1`（東京）— 不要改**（Supabase 在 ap-northeast-1，跨區每 query +170ms）
- **部署走 GitHub Actions**（`prebuilt` build + deploy），`main` 一推就上 prod；engenie 的 Vercel 原生 build 已停用
- **Crons**：`/api/cron/reindex-web`（每週日 re-crawl web 來源）、`/api/cron/reindex-products`（每日 09:30 台灣時間，全量備援；SpecHub sync 完成後也會即時 POST 觸發窄域 re-index）

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 連線（與 SpecHub 同一個 project） |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key（bypass RLS） |
| `API_KEY_ENC_SECRET` | 加密儲存的 API / BYOK keys +（fallback）簽 workspace / widget token。**必須與 SpecHub prod 同一把** |
| `WORKSPACE_TOKEN_SECRET` | workspace / widget token 簽章 key；未設則 fallback 到 `API_KEY_ENC_SECRET` |
| `DEMO_ACCESS_KEY` | `/demo/ask` demo 站的 passcode |
| `CRON_SECRET` | reindex cron 授權（與 SpecHub 同值） |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Docs 來源的 Drive API service account |
| `FIRECRAWL_API_KEY` / `JINA_API_KEY` | `web` 來源的內容萃取（Firecrawl → Jina → fetch 層疊） |

> **LLM keys（Claude / GPT / Gemini，含 OpenAI Embedding）不放 env** — 在 Settings ▸ AI Provider API Keys 設定（存共用 `app_settings`，與 SpecHub 共用）；env 可覆蓋但非必要。
