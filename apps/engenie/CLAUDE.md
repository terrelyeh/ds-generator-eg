# CLAUDE.md — EnGenie (apps/engenie)

> Last updated: 2026-09-12。monorepo 拆分全部完成，prod `engenie-eg` 在拆分後架構；
> 本檔承接原 spechub CLAUDE.md 的 RAG / Ask / Knowledge context。
>
> 🔴 2026-09-03~04 全專案 code review 的教訓散在下方各條——檢索排除改在 SQL 做、沒有 passcode 就沒有
> 私有知識領域、ingest 先寫再刪、所有對外抓取走 `safe-url`、釘 `search_path` 前先想它依賴哪個 schema。
> **動 RLS / auth / ingest 前先讀 [`docs/common-pitfalls.md`](docs/common-pitfalls.md) 的 #69–#72。**
> 2026-09-09~12 的新東西（internal_doc、站內文件檢視、答案附圖、Chrome extension、聊天介面改版、
> passcode 可查看、Workspace 分析）的規則在「Ask / RAG 系統」，原因與歷史在
> `docs/ask-implementation-notes.md`；待辦在「Next Steps」。

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
- RAG: pgvector (HNSW) + OpenAI Embedding (`text-embedding-3-small`，**直連，不走 OpenRouter**) + LLM 一律經 **OpenRouter**（`@eg/llm/openrouter`）
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
      knowledge/doc/[...slug]/       # 站內文件檢視頁（存在我們這裡的內容，引用連到這；擋 ask.use）
      wifi-regulation/[code]/page.tsx # 各國 WiFi 法規 markdown 檢視（citation 連到這）
      settings/                      # hub + ask-workspaces / personas / ask-welcome / api-access / api-keys(LLM)
                                     #   / models(模型目錄) / ai-usage(花費) / workspace-analytics(用量分析，含 [key])
      page.tsx                       # / → redirect /ask
    (demo)/                          # 公開區（passcode/token 自帶 gate）
      ask/[slug]/page.tsx            # 部門 workspace 聊天入口
      demo/ask/page.tsx              # EnGenie demo（passcode + iOS PWA）
      embed/[slug]/page.tsx          # widget iframe 內容（Chrome extension 也是 iframe 這一頁）
    auth/                            # 一行 re-export 自 @eg/auth/pages|routes（只傳 app 名與 tagline）
    api/
      ask/route.ts                   # RAG SSE stream（經 OpenRouter）+ workspace 模式；每題寫一列 ask_requests
      ask/feedback/route.ts          # 👍👎（憑回答附帶的 request id）
      analytics/workspaces/…         # Workspace 分析的資料（admin，`analytics.view`）
      v1/search/route.ts             # 對外 Search API（Bearer sk_live_、JSON、scoped、限流）
      documents/{route,upload,file-url} # RAG 索引管理（ingest pipelines）
      knowledge-assets/[...path]     # 私有 bucket 的圖 → 簽章網址（不經 proxy，保護全靠 handler）
      ask-workspaces(/passcode), knowledge-areas, taxonomy, topology-icons, personas
      api-keys/route.ts              # 對外 API key CRUD
      settings/route.ts, settings/models # LLM keys（app_settings）與模型目錄（存檔時對 OpenRouter 驗 id）
      ws-auth, demo-auth, chat-sessions
      cron/reindex-web/route.ts      # 每週日 re-crawl web 來源（時間預算＋280s 硬停，跑不完的留到之後；心跳每次都寫）
      cron/reindex-products/route.ts # product_spec re-index：POST(spechub sync)/GET(每日 09:30 TW，順便清 90 天前的問題原文)
  components/
    layout/engenie-shell.tsx         # navbar(Ask/Knowledge/Settings) + footer + Toaster
    ask/、demo/、knowledge/          # 兩個聊天 surface（ask-chat 內部；engenie-chat 給 demo/workspace/widget）、知識庫 UI
    chat/                            # 兩個 surface 共用：answer-activity（進度＋來源）、answer-figures、answer-feedback
    analytics/                       # Workspace 分析的頁面與圖表（自己畫的 SVG，沒有圖表庫）
    settings/                        # hub + 各編輯器（models-editor / ai-usage-dashboard / ask-workspaces-manager…）
    ui/                              # shadcn（與 spechub 各持一份，品牌可分道）
  hooks/use-chat-stream.ts           # SHARED 串流引擎（兩個聊天 surface 共用）
  hooks/use-stick-to-bottom.ts
  lib/
    rag/                             # retrieve 核心 + ingest-* + embeddings + taxonomy + personas + doc-view
    ask/                             # workspaces、citations、figures、activity、origins、byok-key、ask-log/record-ask、visitor
    analytics/                       # Workspace 分析：期間、狀態規則、格式化（純函式、有測試）+ queries（RPC）
    demo/                            # byok/history/ws-token（localStorage helpers）
    auth/{workspace-session,demo-session,api-key,passcode,asset-token}.ts  # engenie 專屬 auth（RBAC 在 @eg/auth）
    google/docs.ts                   # Google Docs 讀取；service account 在 @eg/google/auth
  proxy.ts                           # session refresh + 公開路由 + demo/ws cookie/bearer 放行 + embed CSP
scripts/index-internal-docs.ts       # internal_doc 整包匯入（只有 CLI）
```

## 與 SpecHub 的跨 app 接點（重要）

1. **產品資料流**：spechub `/api/sync`（每日 09:00 TW）同步 Sheets→DB 後，
   POST 本 app `/api/cron/reindex-products`（`Bearer CRON_SECRET`，兩專案同值）
   帶 `{models:[…]}` 窄域 re-index；本 app 另有每日 09:30 cron 全量備援
   （content_hash 跳過未變更 chunk，全量也便宜）。
2. **SpecHub 側邊 Ask** = 本 app 的 widget（workspace `spechub`，無 passcode、
   shared LLM、scope 全開）。spechub 端由 `NEXT_PUBLIC_ENGENIE_URL` 載入
   `/widget.js`。**不要刪 `spechub` workspace row**。
3. **LLM keys 管理 UI 在本 app**（`/settings/api-keys` → `/api/settings`），存共用 `app_settings`。
   **2026-08-06~07 起 chat completions 全部走 OpenRouter**（`@eg/llm`）：
   兩把 key —— `openrouter_api_key`（SpecHub：翻譯 + battlecard）與
   `openrouter_api_key_ask`（本 app；沒設會 fallback 回前者）。
   ⚠️ **embedding 仍直連 OpenAI**（`openai_api_key` 永久保留 —— OpenRouter 不提供 embedding，
   換模型等於全庫重建索引）。
   **模型清單在 `llm_models` 表**，管理頁 `/settings/models`（本 app，admin only），Ask 的下拉也讀它；
   spechub 只留一支唯讀的 `/api/settings/models?surface=translate`。**slug 是那一列的身分，不能就地改**
   （換模型 = 新增一列 → 移預設 → 停用舊的；還被 workspace 指定的 slug 刪不掉）。
   存檔時會拿 OpenRouter 的清單驗每個啟用中的 id（`@eg/llm/catalog`）。原因與細節見
   [`docs/ask-implementation-notes.md`](docs/ask-implementation-notes.md) 的「模型目錄」。
4. **產品表唯讀約定**：spechub 改產品表 schema 前要確認本 app 的
   ingest-products/taxonomy 不受影響。migrations 一律放 `packages/db/supabase/migrations/`。

## Database Tables（EnGenie 擁有 schema 演進權）

- `documents` — RAG 向量索引：source_type, content, embedding VECTOR(1536), metadata JSONB, content_hash。HNSW index（00022）+ **pg_trgm GIN index on content/title/source_id（00026）** — 讓 retrieve.ts 的型號 `ilike '%ECW…%'` 補充查詢走索引不掃全表
- `ask_workspaces` — 多租戶 Ask：slug, passcode_hash, llm_mode('shared'|'byok'|'user_byok'), byok_key_encrypted, scope JSONB（含 knowledge_areas[]）, persona/profile/allow_switch, 配額欄位, allowed_origins（widget CSP）, token_version（撤銷）、passcode_encrypted（00059，admin 可查看；驗證仍只看 hash）。RPC `ask_workspace_touch`
- `api_keys` — 對外 Search API key：key_hash(sha256 驗證), key_encrypted(AES-256-GCM 供複製), scope, 限流欄位。RPC `api_key_touch`
- `chat_sessions` — 對話持久化，**綁 `user_id`**（route 一律 `.eq("user_id", …)`；舊 `anonymous` 列已孤立，見 Pitfall 62）
- `ask_requests`（00060）— 每一題一列：channel / workspace / `user_id` 或 `visitor_id` / question（90 天後清空）/ outcome / match_count / top_similarity / cited（文件層級的名稱）/ 首字時間 / feedback。RPC `ask_analytics_*`（summary、daily、gaps、sources、spend、last_seen）與 `ask_requests_redact`；RLS 開、零 policy
- `llm_models`（模型目錄）、`llm_usage_events`（花費帳本；Ask 的 `ref` = workspace slug／`internal`／`demo`）—— 由 `@eg/llm` 讀寫；Workspace 分析的花費讀帳本
- Storage：`knowledge-assets`（私有 bucket，00058，內部文件的圖；讀取走 `/api/knowledge-assets` 轉簽章網址）
- `auth_rate_limits` — passcode 暴力猜測限流（fixed-window / RPC `auth_rate_check`，00027）；service-role only
- `topology_icons` — 拓撲圖示
- 共同：`solutions`（spechub 管產品 solution；engenie 只新增 `kind='knowledge'` 列 — `/api/knowledge-areas`）
- 唯讀（spechub 擁有）：products, product_lines, profiles, email_whitelist, app_settings（settings route 例外：LLM keys 讀寫）
- **RLS**：全表已開 RLS；`documents`/`chat_sessions` 為 deny-all backstop（app 全走 service-role + RBAC）。prod 現況已在 migration 00028 補記（之前只在 prod 開、repo 沒檔）

## Ask / RAG 系統

完整架構見 [`docs/rag-context.md`](docs/rag-context.md)（**改 Ask/RAG/知識庫前先讀**）。
對外 API 規格見 [`docs/api-search.md`](docs/api-search.md)；聊天 UX 規範見
[`docs/ask-chat-ux-spec.md`](docs/ask-chat-ux-spec.md)；Workspace Phase 2 計畫見
[`docs/ask-workspaces-phase2-plan.md`](docs/ask-workspaces-phase2-plan.md)。
**每條規則背後的原因與歷史在 [`docs/ask-implementation-notes.md`](docs/ask-implementation-notes.md)**——改對應的程式前先讀那一節。

規則速記：
- **檢索只有一份** `lib/rag/retrieve.ts`（`/api/ask` 與 `/api/v1/search` 共用）；scope 排除在 SQL 做（`match_documents_scoped`，00051）。`/api/v1/search` 一律 `knowledgeAreasAllowed: []`。
- **沒有 passcode 的 workspace 拿不到私有知識領域**（`allowedKnowledgeAreas()`）。
- **串流只有一份** `hooks/use-chat-stream.ts`，新的聊天介面一律複用；兩個介面共用的元件在 `components/chat/`。
- **11 種 source type**；`internal_doc` 只有 CLI（`scripts/index-internal-docs.ts`），知識領域預設 `rd-internal`，`assertKnowledgeArea()` 擋打錯的 slug（打錯不會失敗，會變成對外可見）。
- **讀 `message.content` 找引用前先過 `normalizeCitations()`**——有模型會寫成 `[Source 7]`。
- **答案附圖只看真的被引用的來源**（`lib/ask/figures.ts`）；圖一律 `<img>`、不 inline SVG；問題沒在要圖時預設收合。
- **站內內容的引用連到 `/knowledge/doc/<type>/<id>`**，擋 `ask.use`（不是 `knowledge.view`）；app 內路徑只有內部 `/ask` 的讀者連得開。
- **`/api/knowledge-assets` 不經過 proxy**（matcher 排除圖檔副檔名），保護全靠 handler；沒有登入的讀者用 `asset-token` 簽章連結（24 小時、只開那一張）。
- **ingest 先寫再刪**（`trimStaleChunks()`）；**所有對外抓取走 `lib/rag/safe-url.ts`**；HTML 轉文字前先 `stripHiddenHtml()`；檢索到的文字包在 `<source>` 元素裡。
- **ingest 讀既有 chunk 一律分頁**（`selectAll()`，`lib/rag/select-all.ts`）——PostgREST 一次最多 1000 列、截斷不報錯。
- **「消失的來源」只能在 run 真的列舉了整個宇宙時清**（pitfall #77）：手動給的網址清單（Add Article、逐列 Sync、cron 分批）不是宇宙；web 完全不清。
- **GitBook 以批次邊做邊寫**；「這頁做完了」的標記（`last_modified`、`page_hash`）只在該頁最後一次寫入，規則與測試在 `lib/rag/gitbook-plan.ts`。
  **Vision 暫時性失敗（timeout / 429 / 5xx）整頁不寫**，不要改回「少了描述照寫」。
- **BYOK 的 key 一律是 OpenRouter key**，格式判斷只在 `lib/ask/byok-key.ts`。
- **passcode 驗證只看 `passcode_hash`**；`passcode_encrypted`（00059）只給 admin 查看，解開後再用 hash 驗一次。
- **每一題寫一列 `ask_requests`**（00060，在 `/api/ask` 串流結束、關閉前寫），回答的 metadata 帶 `request_id` 給 👍👎；`LOW_SIMILARITY`（TS）要和 00060 SQL 的預設值一致。
- workspace token = `<version>.<exp>.<sig>`（HMAC）；嵌入白名單 = CSP `frame-ancestors`（沒設 = 不限制；讀不到 = 只准 `'self'`）。
- **Chrome extension 只是另一個嵌入點**：白名單加 `chrome-extension://dakefbpojccpgknegbfbfeicfadbeamk`（ID 由 manifest 的 `key` 固定），`normalizeOrigins()` 必須收這個 scheme。
- 模型解析走 `pickModel()`（只接受已啟用、且開放給該 surface 的 slug）；Gemini key 放 header，錯誤回前端前先 `redactSecrets()`。
- `/api/ask` 限流：內部每人每分鐘 30 題、demo 每 IP 20 題；workspace 走自己的配額（`ask_workspace_touch`）。

## Ask 效能路徑（`/api/ask` — 2026-07-05 hardening 後）

首 token 從 5–6s 降到 prod ~3.5s。關鍵設計，改 route 前務必理解：
- **檢索平行化**：persona prompt / LLM key / topology hint 用 `Promise.all` 與 `retrieveDocuments` **同時**跑，不要移回檢索後（見 Pitfall 63）。這些 promise 都 `.catch` 成 fallback，不會 unhandled reject
- **sources 事件在 LLM 串流之前送**：檢索一完成就 `sendEvent({type:"sources"})`，前端 `use-chat-stream` 掛到串流中的訊息、UI 立即顯示來源（別移回串流結束）
- **三層 in-process 快取**（各 60s TTL / LRU，寫入時 invalidate）：`getApiKey`（@eg/db settings）、`listPersonas`/`getPersona`、`generateEmbedding`（LRU 300）
- **Gemini Flash 壓 reasoning**：模型目錄（`llm_models`）的 flash/lite 設低檔位；**`gemini-3.5-flash` 只能 `low`，設 `none` 會被 OpenRouter 400 擋掉**（Pitfall 61）
- **history 有字元預算**：`trimHistory()` 每則 1.5k / 總 12k 字，長對話不再脹 prefill

## Next Steps（待辦）

- **Microsoft 365 登入（等 IT）**——要按「人」看 workspace 用量得先有身分；做法與要問 IT 的兩個租用戶設定寫在
  [`docs/ask-workspaces-phase2-plan.md`](docs/ask-workspaces-phase2-plan.md)「待辦」一節。在那之前 workspace 維持 passcode。
- **調 `LOW_SIMILARITY`（目前 0.45）**：`ask_requests` 累積一兩週後看實際分布再調；TS 常數與 00060 SQL 預設值要一起改。
- **Workspace 分析的選配（未做）**：每週摘要推 Telegram、CSV 匯出。
- `ejp` 的 passcode 只有 hash（00059 之前設的），要分享得先重設一次。
- 新開的知識領域**不會自動進 `ext`** workspace，要手動勾。
- Extension 的下一步想法：在 extension 裡選 workspace、「問這一頁」；widget 的模型標籤對 3.7 顯示原始 slug。

## Common Pitfalls

全部 24 條（編號沿用 spechub、不重排）在 [`docs/common-pitfalls.md`](docs/common-pitfalls.md)。最常踩的：

- **#54** `useChatStream` 的 POST body 一律 `...getParams()` 展開——寫死欄位清單會靜默丟掉 workspace／userKey。
- **#59** 檢索的 embedding 只用「當前問題」，不串對話歷史。
- **#62** `chat_sessions` 的每個查詢都要 `.eq("user_id", user.id)`。
- **#63** Ask 熱路徑快取（LLM key、persona）的寫入端一定要 invalidate。
- **#66** 模型清單一律來自 `llm_models`（前端用 `useAskModels()`），元件裡不准寫死。
- **#68** 上游 LLM 失敗送 `type:"error"`，不要送成 `chunk`；判斷 Ask 是否活著看帳本 `llm_usage_events` 有沒有新列。
- **#69** 釘 `search_path` 前先想函式依賴哪個 schema（pgvector 的 `<=>` 在 `extensions`）。
- **#70** 沒有 passcode 的 workspace，`ws-auth` 會發 token 給任何人——新增 workspace 時要決定的是 passcode。
- **#72** 陌生人能編輯、又會餵給模型的文字，加上邊界之前都是指令通道。
- **#74** engenie 的測試跑在 spechub 的 vitest config 裡——被測模組內部用相對 import。

## Deployment

```bash
npm run dev -w engenie    # local dev (port 3100)
npm run build -w engenie
```

- Vercel 專案 `engenie-eg`，Root Directory `apps/engenie`，region **hnd1**（不要改）
- Crons：`/api/cron/reindex-web` 週日、`/api/cron/reindex-products` 每日 09:30 TW（GET 順便跑 `ask_requests_redact()`，清掉 90 天前的問題原文）。
  **`reindex-web` 在 2026-09-16 之前從沒跑完過**（9/6、9/13 都在 300s 被殺，pitfall #76）：現在 150s（GitBook 200s）後
  不再開始新來源、**280s 硬停一定寫心跳**，沒做到的寫進心跳（`ok=false`，之後接著做），每個來源一行 log 說花了多久；
  `?only=` 窄化的手動 run 不寫心跳。預算常數在 `lib/rag/reindex-web-run.ts`。
  **兩支都會在跑完時寫 `job_heartbeats`**（`recordHeartbeat` from `@eg/db/heartbeat`）——
  SpecHub 的 `/api/cron/health` 靠它判斷排程有沒有跑，而不是靠副作用（沒變更的 chunk
  不會被重寫，「沒事做」和「沒跑」在資料上一模一樣）。**新增排程時記得補一行心跳，
  並在 `lib/monitoring/health.ts` 的 `EXPECTED_JOBS` 登記**，否則它不會被監控
- Env vars 見 [.env.example](.env.example)。⚠️ `API_KEY_ENC_SECRET` **必須與
  spechub prod 同一把**（DB 內已有用它加密的 api_keys/byok keys）
- LLM keys 在 `/settings/api-keys` 設定（存共用 app_settings），env 可覆蓋

## 詳細文件

- [`docs/ask-implementation-notes.md`](docs/ask-implementation-notes.md) — Ask / RAG 各條規則的原因與歷史（2026-09-13 從本檔搬出，依主題排列）
- [`docs/common-pitfalls.md`](docs/common-pitfalls.md) — 全部 pitfalls（#54–#77，編號不重排）
- [`docs/agent-architecture.md`](docs/agent-architecture.md) — **設計提案**：**單一 agent**（從純 RAG 到「工具導向 Agent」：tool calling / agent loop 基礎觀念 + 針對本系統的設計、分階段計畫、安全模型）。尚未實作；排在 monorepo Phase 5 之後
- [`docs/multi-agent-architecture.md`](docs/multi-agent-architecture.md) — **設計參考**：**多 agent**（agent-architecture 的姊妹篇）。何時才需要、四種 topology（supervisor / agent-as-tool / pipeline / handoff）、上下文傳遞等核心難題、套到 EnGenie 的安全邊界切法與漸進路線。**兩份是並行主題**，HTML 已公開於 `/docs/agent-architecture.html`、`/docs/multi-agent-architecture.html`（可分享）
- [`docs/engenie-knowledge-mcp.md`](docs/engenie-knowledge-mcp.md) — **設計草案**：把知識庫包成 **MCP server**（`engenie_search` 工具），讓任何 MCP client（Claude Code/Desktop、Cursor…）把 EnGenie 知識當原生工具——`engenius-kb` skill 的產品化（＝整合總覽 ask-integration 的 B2 那格）。HTML 公開於 `/docs/engenie-knowledge-mcp.html`
- [`docs/rag-context.md`](docs/rag-context.md) — RAG 完整架構
- [`docs/api-search.md`](docs/api-search.md) — 對外 Search API 規格（HTML 版已公開於 `/docs/api-search.html`）
- [`docs/ask-chat-ux-spec.md`](docs/ask-chat-ux-spec.md) — 聊天互動規範
- [`docs/ask-workspaces-phase2-plan.md`](docs/ask-workspaces-phase2-plan.md) — 部門私有文件自助索引計畫
- [`docs/rag-system.md`](docs/rag-system.md)、[`docs/topology-icon-spec.md`](docs/topology-icon-spec.md)
