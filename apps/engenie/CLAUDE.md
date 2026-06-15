# CLAUDE.md — EnGenie (apps/engenie)

> Last updated: 2026-06-13（monorepo 拆分**全部完成（Phase 1–5）**；Phase 5 cutover
> 已 merge 進 `main`、prod `engenie-eg` 在拆分後架構。Phase 3 自 SpecHub 析出成獨立
> app，本檔承接原 spechub CLAUDE.md 的 RAG / Ask / Knowledge 全部 context。）

## Project Overview

**EnGenie** — EnGenius 公司知識平台。RAG 知識庫（pgvector）+ Ask 聊天
（內部 `/ask`、部門 workspace `/ask/<slug>`、嵌入式 widget `/embed/<slug>`、
demo `/demo/ask`）+ 對外 RAG Search API（`/api/v1/search`）。

與 **SpecHub**（apps/spechub，datasheet 平台）共用：同一個 Supabase
（`xzolvtlqafwkxfuaryec`）、同一套 Auth/whitelist/RBAC（`@eg/auth`）、
同一個 `app_settings`（LLM keys）。**EnGenie 對產品表唯讀**
（product_spec ingest + taxonomy），收斂在 `lib/rag/ingest-products.ts` 與
`/api/taxonomy`，不在 UI/route 散落直查。

## Tech Stack

- Next.js 16 (App Router) + TypeScript、Tailwind v4 + shadcn/ui
- Supabase（共用）via `@eg/db`；RBAC via `@eg/auth`
- RAG: pgvector (HNSW) + OpenAI Embedding (`text-embedding-3-small`) + multi-LLM (Claude/GPT/Gemini)
- react-markdown + remark-gfm + highlight.js（聊天渲染）
- Vercel（專案 `engenie-eg`，region `hnd1` — Supabase 在東京，不要改）
- dev port **3100**（spechub 用 3000）

## Next.js 16 Breaking Changes (IMPORTANT)

- `params`/`searchParams` 是 **Promise** — 必須 await
- `cookies()`/`headers()` 是 **async** — 必須 await
- fetch 預設不快取；Server Components 為預設

## Directory Structure

```
src/
  app/
    (main)/                          # 內部登入區（navbar shell = EngenieShell）
      ask/page.tsx                   # 內部全頁 Ask（RAG chat UI）
      knowledge/page.tsx             # Knowledge Base — 索引管理 dashboard
      wifi-regulation/[code]/page.tsx # 各國 WiFi 法規 markdown 檢視（citation 連到這）
      settings/                      # hub + ask-workspaces / personas / ask-welcome / api-access / api-keys(LLM)
      page.tsx                       # / → redirect /ask
    (demo)/                          # 公開區（passcode/token 自帶 gate）
      ask/[slug]/page.tsx            # 部門 workspace 聊天入口
      demo/ask/page.tsx              # EnGenie demo（passcode + iOS PWA）
      embed/[slug]/page.tsx          # widget iframe 內容
    auth/                            # 自己一份 sign-in/callback/no-access（邏輯同 spechub）
    api/
      ask/route.ts                   # RAG SSE stream + workspace 模式 + persona/profile
      v1/search/route.ts             # 對外 Search API（Bearer sk_live_、JSON、scoped、限流）
      documents/{route,upload,file-url} # RAG 索引管理（8 條 ingest pipeline）
      ask-workspaces, knowledge-areas, taxonomy, topology-icons, personas
      api-keys/route.ts              # 對外 API key CRUD
      settings/route.ts              # LLM provider keys CRUD（讀寫共用 app_settings）
      settings/providers/route.ts    # 模型選單（spechub 也有一份同檔）
      ws-auth, demo-auth, chat-sessions
      cron/reindex-web/route.ts      # 每週日 re-crawl web 來源
      cron/reindex-products/route.ts # product_spec re-index：POST(spechub sync 觸發)/GET(每日 cron 09:30 TW 備援)
  components/
    layout/engenie-shell.tsx         # navbar(Ask/Knowledge/Settings) + footer + Toaster
    ask/、demo/、chat/、knowledge/   # 聊天兩 surface、widget、知識庫 UI（原樣自 spechub 搬入）
    settings/                        # hub + 5 個編輯器
    ui/                              # shadcn（與 spechub 各持一份，品牌可分道）
  hooks/use-chat-stream.ts           # SHARED 串流引擎（兩個聊天 surface 共用）
  hooks/use-stick-to-bottom.ts
  lib/
    rag/                             # retrieve 核心 + 8 條 ingest + embeddings + taxonomy + personas
    ask/workspaces.ts                # workspace 載入/驗證
    demo/                            # byok/history/ws-token（localStorage helpers）
    auth/{workspace-session,demo-session,api-key}.ts  # engenie 專屬 auth（RBAC 在 @eg/auth）
    google/{auth,docs}.ts            # service account（auth.ts 與 spechub 各持一份）
  proxy.ts                           # session refresh + 公開路由 + demo/ws cookie/bearer 放行 + embed CSP
```

## 與 SpecHub 的跨 app 接點（重要）

1. **產品資料流**：spechub `/api/sync`（每日 09:00 TW）同步 Sheets→DB 後，
   POST 本 app `/api/cron/reindex-products`（`Bearer CRON_SECRET`，兩專案同值）
   帶 `{models:[…]}` 窄域 re-index；本 app 另有每日 09:30 cron 全量備援
   （content_hash 跳過未變更 chunk，全量也便宜）。
2. **SpecHub 側邊 Ask** = 本 app 的 widget（workspace `spechub`，無 passcode、
   shared LLM、scope 全開）。spechub 端由 `NEXT_PUBLIC_ENGENIE_URL` 載入
   `/widget.js`。**不要刪 `spechub` workspace row**。
3. **LLM keys 管理 UI 在本 app**（`/settings/api-keys` → `/api/settings`），
   存共用 `app_settings`；spechub 的 translate runtime 直接讀同一筆（@eg/db settings）。
4. **產品表唯讀約定**：spechub 改產品表 schema 前要確認本 app 的
   ingest-products/taxonomy 不受影響。migrations 一律放 `packages/db/supabase/migrations/`。

## Database Tables（EnGenie 擁有 schema 演進權）

- `documents` — RAG 向量索引：source_type, content, embedding VECTOR(1536), metadata JSONB, content_hash。HNSW index（00022）
- `ask_workspaces` — 多租戶 Ask：slug, passcode_hash, llm_mode('shared'|'byok'|'user_byok'), byok_key_encrypted, scope JSONB（含 knowledge_areas[]）, persona/profile/allow_switch, 配額欄位, allowed_origins（widget CSP）, token_version（撤銷）。RPC `ask_workspace_touch`
- `api_keys` — 對外 Search API key：key_hash(sha256 驗證), key_encrypted(AES-256-GCM 供複製), scope, 限流欄位。RPC `api_key_touch`
- `chat_sessions` — 對話持久化
- `topology_icons` — 拓撲圖示
- 共同：`solutions`（spechub 管產品 solution；engenie 只新增 `kind='knowledge'` 列 — `/api/knowledge-areas`）
- 唯讀（spechub 擁有）：products, product_lines, profiles, email_whitelist, app_settings（settings route 例外：LLM keys 讀寫）

## Ask / RAG 系統

完整架構見 [`docs/rag-context.md`](docs/rag-context.md)（**改 Ask/RAG/知識庫前先讀**）。
對外 API 規格見 [`docs/api-search.md`](docs/api-search.md)；聊天 UX 規範見
[`docs/ask-chat-ux-spec.md`](docs/ask-chat-ux-spec.md)；Workspace Phase 2 計畫見
[`docs/ask-workspaces-phase2-plan.md`](docs/ask-workspaces-phase2-plan.md)。

速記（細節都在上述文件）：
- **檢索核心只有一份** `lib/rag/retrieve.ts`（`retrieveDocuments`）— `/api/ask` 與 `/api/v1/search` 共用；統一 `inScope` scope resolver；知識領域（`kind='knowledge'`）私有/opt-in；`/api/v1/search` 一律傳 `knowledgeAreasAllowed: []`（不外洩部門知識）
- **串流核心只有一份** `hooks/use-chat-stream.ts` — ask-chat（內部）與 engenie-chat（demo/workspace）共用；新增聊天 surface 一律複用，不要複製串流邏輯
- **8 條 ingest pipeline**（`lib/rag/ingest-*`）：product_spec, gitbook, helpcenter, google_doc, wifi_regulation, web, text_snippet, file(PDF→Gemini 抽取)
- workspace session token = `<version>.<exp>.<sig>`（HMAC, `WORKSPACE_TOKEN_SECRET`）；widget 嵌入網域白名單 = proxy 設 CSP `frame-ancestors`（fail-open）
- Gemini 一律 `x-goog-api-key` header；錯誤回前端先 `redactSecrets()`

## Common Pitfalls（自 spechub 繼承，編號保留）

54. **`useChatStream` POST body 一律 `...getParams()` 展開**，別寫死欄位清單 — 否則 workspace/userKey 等欄位被靜默丟掉，workspace 模式整個被繞過（看起來能用、送出才壞）。
55. **Postgres RPC 的 `bigint` 經 PostgREST 回來是字串** — `knowledge_sources()` 的 chunks/total_tokens 要 `Number(x) || 0` 再用。
56. **Gemini key 永遠放 header 不放 URL**；錯誤訊息回前端前先 redact。
57. **`knowledge-base.tsx` 是 orchestrator** — 對話框在 `knowledge/dialogs/`、共用邏輯在 `knowledge/shared.ts`；新增來源類型照這結構，別把 state 塞回 parent。
58. **Workspace token 撤銷機制** — `verifyWorkspaceToken()` 只驗簽章+到期（Edge 粗篩）；版本撤銷的權威檢查在 route handler（`workspaceAuthorized`）。改 token 格式/換 signing secret = 所有現存 token 失效（widget 自動重發、passcode 重輸一次）。

## Deployment

```bash
npm run dev -w engenie    # local dev (port 3100)
npm run build -w engenie
```

- Vercel 專案 `engenie-eg`，Root Directory `apps/engenie`，region **hnd1**（不要改）
- Crons：`/api/cron/reindex-web` 週日、`/api/cron/reindex-products` 每日 09:30 TW
- Env vars 見 [.env.example](.env.example)。⚠️ `API_KEY_ENC_SECRET` **必須與
  spechub prod 同一把**（DB 內已有用它加密的 api_keys/byok keys）
- LLM keys 在 `/settings/api-keys` 設定（存共用 app_settings），env 可覆蓋

## 詳細文件

- [`docs/agent-architecture.md`](docs/agent-architecture.md) — **設計提案**：**單一 agent**（從純 RAG 到「工具導向 Agent」：tool calling / agent loop 基礎觀念 + 針對本系統的設計、分階段計畫、安全模型）。尚未實作；排在 monorepo Phase 5 之後
- [`docs/multi-agent-architecture.md`](docs/multi-agent-architecture.md) — **設計參考**：**多 agent**（agent-architecture 的姊妹篇）。何時才需要、四種 topology（supervisor / agent-as-tool / pipeline / handoff）、上下文傳遞等核心難題、套到 EnGenie 的安全邊界切法與漸進路線。**兩份是並行主題**，HTML 已公開於 `/docs/agent-architecture.html`、`/docs/multi-agent-architecture.html`（可分享）
- [`docs/engenie-knowledge-mcp.md`](docs/engenie-knowledge-mcp.md) — **設計草案**：把知識庫包成 **MCP server**（`engenie_search` 工具），讓任何 MCP client（Claude Code/Desktop、Cursor…）把 EnGenie 知識當原生工具——`engenius-kb` skill 的產品化（＝整合總覽 ask-integration 的 B2 那格）。HTML 公開於 `/docs/engenie-knowledge-mcp.html`
- [`docs/rag-context.md`](docs/rag-context.md) — RAG 完整架構
- [`docs/api-search.md`](docs/api-search.md) — 對外 Search API 規格（HTML 版已公開於 `/docs/api-search.html`）
- [`docs/ask-chat-ux-spec.md`](docs/ask-chat-ux-spec.md) — 聊天互動規範
- [`docs/ask-workspaces-phase2-plan.md`](docs/ask-workspaces-phase2-plan.md) — 部門私有文件自助索引計畫
- [`docs/rag-system.md`](docs/rag-system.md)、[`docs/topology-icon-spec.md`](docs/topology-icon-spec.md)
