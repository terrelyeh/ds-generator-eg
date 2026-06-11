# Monorepo 拆分藍圖 — SpecHub × EnGenie

> 撰寫日期:2026-06-11。狀態:**已定案(monorepo),§8 決定點已全數確認(同日)——可動工,從 Phase 0/1 開始**。
> 目標:把現有單一 Next.js app 拆成兩個獨立部署的 app,共用同一個 Supabase。

---

## 1. 目標與原則

- **SpecHub**(`apps/spechub`)= 文件生成平台:Datasheet 同步/編輯/翻譯/PDF,未來延伸其他文件類型。
- **EnGenie**(`apps/engenie`)= 公司知識平台:Knowledge RAG + Ask(內部問答、部門 workspace、widget、Search API),未來接更多部門資料。
- **共用同一個 Supabase**(project `xzolvtlqafwkxfuaryec`):Auth/whitelist/RBAC 共用;EnGenie 唯讀產品表(product_spec ingest + taxonomy);migrations 單一來源。
- **部署各自獨立**:兩個 Vercel 專案指向同一 repo 的不同 root directory,皆釘 `hnd1`。
- **設計保留未來 DB 拆分的可能**:EnGenie 對產品表的讀取收斂在 ingest/taxonomy adapter 層,不在 UI/route 裡散落直查。
- 時機優勢:widget **尚未**發給任何部門 → 一次到位切換,不需要舊網址過渡層。

## 2. 目標結構

```
ds-generator-eg/                  # 同一個 git repo 原地重構(歷史保留)
├── apps/
│   ├── spechub/                  # 現有 app 搬入(Vercel 專案 ds-generator-eg,root 改這裡)
│   └── engenie/                  # 新 Vercel 專案(網域待定,預設 engenie-eg.vercel.app)
├── packages/
│   ├── db/                       # supabase clients + settings accessor + migrations/(唯一來源)+ DB types
│   └── auth/                     # session.ts(RBAC/gate)+ permissions.ts + page-guards
├── package.json                  # npm workspaces(維持 npm;turbo 之後想加再加)
└── CLAUDE.md                     # root 總覽;apps/*/CLAUDE.md 各自細節
```

- 套件管理:**npm workspaces**(沿用 npm/nvm 環境慣例)。Vercel 端各專案設 Root Directory + `Include source files outside of the Root Directory`。
- shadcn `components/ui/`、`globals.css`、`lib/utils.ts`:**兩邊各持一份**(品牌會分道揚鑣,共用反而綁手)。
- `lib/google/auth.ts`(service account JWT,兩邊都用):先複製兩份(檔案小),之後有需要再上提 packages。

## 3. 歸屬清單

### 3.1 頁面路由

| → apps/engenie | → apps/spechub |
|---|---|
| `(demo)/ask/[slug]`、`(demo)/demo/ask`、`(demo)/embed/[slug]` | `(main)/` dashboard(含 `[solution]`)、`product/[model]`、`compare/[line]`、`changelog/[line]`、`translations/[line]`、`docs/sync` |
| `(main)/ask`(內部登入版 Ask — **整個 Ask 產品歸 EnGenie,含內部版**) | `(print)/preview/[model]` |
| `(main)/knowledge`、`(main)/wifi-regulation/[code]`(引用來源頁) | `settings/`:typography、glossary、users、(settings 首頁) |
| `settings/`:ask-workspaces、personas、ask-welcome、api-access、**api-keys(LLM keys,建議歸 AI 平台)** | |
| `auth/*`(sign-in / no-access / redirecting)**兩邊各一份**(邏輯來自 packages/auth) | 同左 |

### 3.2 API 路由

| → apps/engenie | → apps/spechub |
|---|---|
| `ask`、`ws-auth`、`demo-auth`、`chat-sessions` | `sync`、`generate-pdf`、`notify`、`upload-image` |
| `documents`、`documents/upload`、`documents/file-url` | `resync-product`、`resync-versions`、`detect-locale-version` |
| `v1/search`、`ask-workspaces`、`knowledge-areas`、`taxonomy` | `translate`、`translations/product`、`translations/spec-labels`、`glossary` |
| `topology-icons`、`personas`、`api-keys`(LLM keys CRUD) | `settings`、`settings/fonts`、`settings/typography` |
| `cron/reindex-web`(EnGenie 自己的 vercel.json cron) | `users`、`users/[id]`、`users/invite`、`users/whitelist/[email]`、`products/[model]/layout-ack` |
| `settings/providers` **兩邊各一份**(ask 模型選單與 translate UI 都要;讀同一 app_settings) | 同左 |

### 3.3 lib / components / public

| 區域 | engenie | spechub | packages |
|---|---|---|---|
| lib | `rag/*`、`ask/*`、`demo/*`(byok/history/ws-token)、`auth/{workspace-session,demo-session,api-key}`、`google/docs.ts` | `datasheet/*`、`translate/*`、`google/{sheets,drive-*,sheets-extra}`、`notifications/*` | `supabase/*` + `settings.ts` → **packages/db**;`auth/{session,permissions,page-guards}` → **packages/auth** |
| components | `ask/`、`demo/`、`knowledge/`、`chat/`、settings 中的 ask-workspaces/personas/ask-welcome/api-access/api-keys editor | `dashboard/`、`product/`、`compare/`、`changelog/`、`translations/`、`preview/`、`layout/main-shell`、settings 其餘 | `ui/`(shadcn)兩邊各一份 |
| public | `widget.js`、`demo-icons/`、`demo-manifest`、docs:`api-search`、`ask-chat-ux-spec`、`ask-integration`、`rag-system`、`topology-icon-spec`、`widget-demo` | `logo/`、`images/`、docs:`drive-folder-and-naming-rules`、`overview-length-rule` | — |
| proxy.ts | 自己一份(demo/ws-bearer 邏輯 + embed CSP frame-ancestors) | 自己一份(較單純:auth gate + automation bypass) | 共用 helper 由 packages/auth 提供 |
| vercel.json | crons: `reindex-web`;regions: hnd1 | crons: 每日 sync;regions: hnd1 | — |

### 3.4 資料表擁有權(同一個 DB,只是「誰負責 schema 演進」)

| Owner | 資料表 |
|---|---|
| **spechub** | products、product_lines、versions、product_translations(+spec labels 等)、translation_glossary、profiles、email_whitelist、app_settings |
| **engenie** | documents、ask_workspaces、api_keys、chat_sessions、topology_icons |
| **共同** | `solutions`(spechub 管產品 solution;engenie 只新增 `kind='knowledge'` 列) |
| **約定** | engenie 對產品表**唯讀**;spechub 改產品表 schema 前需確認 engenie 的 ingest-products/taxonomy 不受影響。migrations 一律放 `packages/db/migrations/`。 |

### 3.5 環境變數分配(Vercel 兩專案)

| engenie | spechub | 兩邊都要 |
|---|---|---|
| `WORKSPACE_TOKEN_SECRET`、`DEMO_ACCESS_KEY`、`FIRECRAWL_API_KEY`、`JINA_API_KEY`、`WIFI_REGHUB_API_KEY` | `GOOGLE_SERVICE_ACCOUNT_JSON`(sheets/drive)、`TELEGRAM_*`、`CRON_SECRET`、`VERCEL_AUTOMATION_BYPASS_SECRET`、`PDF_PREVIEW_BASE_URL` | `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`API_KEY_ENC_SECRET`(engenie 解 BYOK/api_keys;spechub 若讀加密設定也需)、LLM keys(`ANTHROPIC/OPENAI/GOOGLE_AI`,translate 與 RAG 各自用) |

註:engenie 的 google_doc ingest 也用 `GOOGLE_SERVICE_ACCOUNT_JSON` → 兩邊都設。

## 4. 跨 app 接點(已含建議決定)

1. **SpecHub 內的 Ask 入口**:主 nav「Ask」改為連到 EnGenie 網域;原側邊面板改嵌 EnGenie widget(建內部 workspace `spechub`,無 passcode、僅 RBAC 頁面內呈現)。`(main)/ask` 整頁與 chat_sessions 都搬去 engenie。
2. **Supabase Auth**:同一專案服務兩個網域 — 在 Supabase Auth 設定加 engenie 網域到 Redirect URLs;Google 帳號/whitelist/roles 全沿用,各網域各自登入一次。
3. **wifi-regulation 引用頁**搬 engenie(citation URL 是相對路徑,Ask UI 也在 engenie,自洽)。
4. **LLM keys 管理 UI** 放 engenie(AI 平台 = keys 的家);spechub settings 首頁放一行連結過去。兩邊 runtime 都直接讀同一 `app_settings`。

## 5. 執行階段(每階段結束都是可部署的綠燈狀態)

- **Phase 0 — 準備**:開 branch `monorepo-split`;全程用 Vercel preview 驗證,綠了才 merge main。(無 schema 變更 — 整個拆分是 DB-neutral,風險大幅降低。)
- **Phase 1 — 骨架**:root 建 npm workspaces;現有 app 原樣搬進 `apps/spechub`;Vercel 專案 ds-generator-eg 的 Root Directory 改 `apps/spechub`。驗收:行為零變化。
- **Phase 2 — 抽 packages**:`packages/db`(supabase clients、settings accessor、migrations 搬入)、`packages/auth`(session/permissions/page-guards);spechub 改 import。驗收:行為零變化。
- **Phase 3 — 立 engenie**:scaffold `apps/engenie`;按 §3 清單**搬移**(不是複製)所有 engenie 歸屬;寫 engenie 的 proxy/shell/vercel.json;開新 Vercel 專案 + 網域 + env vars;Supabase 加 redirect URL。驗收:engenie preview 上 /ask、/embed、knowledge ingest、v1/search、workspaces 管理全通。
- **Phase 4 — 清理 spechub**:移除已搬走的程式;Ask 面板換 widget;內部連結改指 engenie 網域;更新兩邊 CLAUDE.md/README + root CLAUDE.md;docs/*.md 按歸屬分家。
- **Phase 5 — 切換**:merge main → 兩專案 prod 部署;跑 §6 驗收;更新 `engenius-kb` skill 與 api-search 文件中的 API base URL。

預估:Phase 1–2 約半天、Phase 3 約一天、Phase 4–5 約半天(AI sessions 工作量)。

## 6. 驗收清單

- **spechub**:Google 登入 + whitelist 阻擋、dashboard/product 頁、PDF 生成(Puppeteer self-fetch 仍走自家網域 + bypass secret)、翻譯流程、每日 sync cron、Telegram 通知。
- **engenie**:`/ask/<slug>` passcode→cookie、`/embed/<slug>` bearer token(發 token/過期/撤銷三態)、widget.js 從新網域載入、knowledge 各通道 ingest(snippet/PDF/gitbook per-space sync)、product_spec re-index(跨表讀取)、`/api/v1/search` 帶 api_key、scope 測試(mkt = 產品+行銷領域)、settings 四頁、reindex-web cron。
- **共同**:兩專案 region=hnd1;roles 在兩 app 各自正確 gate;`solutions` 新增知識領域後兩邊 taxonomy 一致。

## 7. 風險與回滾

| 風險 | 緩解 |
|---|---|
| import path 大搬家造成漏改 | 每 phase `tsc --noEmit` + build 全綠才前進;搬移用 `git mv` 保留歷史 |
| Vercel Root Directory/monorepo 設定踩坑 | Phase 1 只搬殼不改碼,先驗 deploy 流程 |
| 兩 app 對 `app_settings`/keys 的隱性依賴 | Phase 3 對 engenie 跑全功能驗收(上表),特別是 translate(spechub)與 ask(engenie)各自能讀到 LLM keys |
| 回滾 | 整個拆分無 DB migration → revert merge commit + 把 Vercel Root Directory 改回去即可 |

## 8. 決定點(2026-06-11 已全數確認 ✅)

1. **EnGenie 網域**:`engenie-eg.vercel.app` ✅
2. **LLM keys 設定頁**:放 engenie ✅
3. **SpecHub 側邊 Ask 面板**:改嵌 EnGenie widget(內部 workspace `spechub`)✅
4. **repo 改名**:後做(不擋動工)✅
