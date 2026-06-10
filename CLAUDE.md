# CLAUDE.md — Project Context

> Last updated: 2026-06-10 (Ask Workspaces: embeddable floating chat widget —
> `public/widget.js` snippet → iframe `/embed/<slug>`, bearer-token auth (no
> cross-site cookies) via `Authorization: Bearer <slug>.<token>`. Earlier:
> Knowledge: Text Snippets + Files (PDF-only) channels
> opened — both index into `documents` via shared `lib/rag/chunk.ts`; PDFs are
> read by Gemini (tables→Markdown, figures described, scanned OCR) with an unpdf
> text-layer fallback, original kept in a private `knowledge-files` Storage
> bucket. (Word/.docx dropped — no AI-extraction benefit.) Earlier:
> Ask Workspaces: multi-tenant /ask/<slug> with
> per-workspace passcode + 3 LLM modes (shared / workspace-BYOK / **user-BYOK**)
> + scoped KB, via an optional `workspace` param on /api/ask. Frontend now
> enforces `allow_switch` (locks selectors) and partitions chat history per
> workspace; BYOK-without-key is blocked at admin + shown as "not ready" on the
> public page. External RAG Search API (/api/v1/search + api_keys + shared
> lib/rag/retrieve.ts) consumed via public docs/api-search.html OR the
> engenius-kb Claude Code skill. generic `web` source; shared chat engine)

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
- **Backend**: Supabase (Postgres + Storage + Auth via Google OAuth)
- **Auth**: `@supabase/ssr` + Google OAuth + DB whitelist + 4-role RBAC
- **Deployment**: Vercel + Vercel Cron
- **Data Source**: Google Sheets API + Google Drive API → synced to Supabase
- **Notifications**: Telegram Bot API
- **PDF**: Puppeteer (server-side) + browser print (client-side)
- **RAG**: pgvector + OpenAI Embedding (`text-embedding-3-small`) + multi-LLM (Claude/GPT/Gemini)
- **Markdown**: react-markdown + remark-gfm（Ask 頁面回答渲染）

## Next.js 16 Breaking Changes (IMPORTANT)

- `params` and `searchParams` are **Promises** — must be awaited
- `cookies()` and `headers()` are **async** — must be awaited
- Fetch requests are **not cached by default**
- Server Components are the default; use `'use client'` for state/hooks/events

## Directory Structure

```
src/
  app/
    (main)/
      dashboard/[solution]/page.tsx    # Per-solution dashboard (reads ?line= for tab)
      compare/[line]/page.tsx
      changelog/[line]/page.tsx
      product/[model]/page.tsx         # Product detail (sticky header, tabs: Detail/Translations)
      translations/[line]/page.tsx     # Per-product-line spec label translations
      ask/page.tsx                    # Ask SpecHub — RAG chat UI
      knowledge/page.tsx              # Knowledge Base — index management dashboard
      settings/page.tsx               # Settings navigation hub (4 cards)
      settings/api-keys/page.tsx      # API key management
      settings/glossary/page.tsx      # Translation glossary management
      settings/typography/page.tsx    # Font + size/weight per locale (split layout with live preview)
      settings/personas/page.tsx      # Ask Persona prompt management
      wifi-regulation/[code]/page.tsx  # Per-country WiFi regulation markdown viewer
      settings/users/page.tsx         # Admin user management (invite + role + remove)
    auth/                             # Public auth flow (no proxy gate)
      sign-in/{page,sign-in-form}.tsx # Google OAuth entry (Suspense-wrapped)
      callback/route.ts               # PKCE code-for-session exchange
      redirecting/page.tsx            # Reads sessionStorage `next`, navigates there
      no-access/page.tsx              # Email not in whitelist → end here
      sign-out/route.ts               # signOut + redirect to sign-in
    (print)/
      preview/[model]/page.tsx        # Datasheet HTML preview (?lang=ja&mode=full&toolbar=false); fetches image_assets for Antennas Patterns page
    api/
      sync/route.ts                   # Sheets → Supabase sync + auto re-index products
      ask/route.ts                    # RAG SSE stream (uses lib/rag/retrieve.ts) + persona/profile + topology hint
      v1/search/route.ts              # PUBLIC external Search API (Bearer sk_live_ key, JSON, scoped, rate-limited)
      api-keys/route.ts               # Admin CRUD for external API keys (settings.manage_api_access)
      documents/route.ts              # RAG index mgmt (GET/POST/PATCH/DELETE; web/gitbook/helpcenter/google_doc/wifi/product_spec)
      taxonomy/route.ts               # Returns solutions + product_lines + products for dropdowns
      generate-pdf/route.ts           # Puppeteer PDF + generation lock
      resync-versions/route.ts        # Re-scan Drive → update products.current_versions (admin/editor)
      upload-image/route.ts           # Upload to Supabase + Google Drive
      translate/route.ts              # AI translation endpoint (multi-provider)
      chat-sessions/route.ts          # Conversation persistence
      personas/route.ts               # Persona CRUD
      settings/route.ts               # API key CRUD (optimistic locking)
      settings/{providers,typography,fonts}/route.ts
      glossary/route.ts               # Translation glossary CRUD
      products/[model]/layout-ack/route.ts  # Per-locale layout overflow ack (hash-bound)
      users/                          # Admin user management (admin role only)
        route.ts                      # GET list active + pending
        invite/route.ts               # POST add to email_whitelist
        [id]/route.ts                 # PATCH role / DELETE remove
        whitelist/[email]/route.ts    # DELETE pending invite
  middleware/proxy
    src/proxy.ts                      # Next.js 16 proxy (formerly middleware) — refresh session + auth gate
  hooks/
    use-chat-stream.ts                  # SHARED Ask 串流引擎（messages/loading/status + SSE + abort + regenerate）。ask-chat 與 engenie-chat 共用
    use-stick-to-bottom.ts              # SHARED 智慧自動捲動（貼底才跟 + 回到底部鈕）
  components/
    layout/navbar.tsx, solution-sidebar.tsx, main-shell.tsx, user-menu.tsx
    chat/code-block.tsx                 # SHARED 程式碼區塊（語言標籤 + 複製 + hljs 高亮）— react-markdown 的 pre override
    ask/ask-chat.tsx                    # 桌機 Ask panel（.ask-markdown 樣式、inline 引用 tooltip、對話歷史、Persona/Profile/Model 選擇器）
    demo/engenie-chat.tsx               # EnGenie demo 聊天（prose 樣式、隱藏 inline 引用、EngenieMark 頭像）
    knowledge/
      knowledge-base.tsx                # Source cards + per-row Sync/Edit, TaxonomyBadges
      taxonomy-picker.tsx               # Cascading Solution > Product Line > Model multi-select
    dashboard/dashboard-content.tsx     # Tabs + Lang column + Translations link
    product/product-detail.tsx
    preview/print-toolbar.tsx
    settings/{settings-page,personas-editor,api-keys-editor,glossary-editor,typography-editor,users-manager}.tsx
    compare/compare-table.tsx
  lib/
    auth/
      permissions.ts                  # Role + Permission types + matrix; can() / assertCan() / isRole()
      session.ts                      # getCurrentUser / requireUser / requirePermission + gate() / gateOrCron() helpers
      page-guards.ts                  # adminOnly / requirePagePermission / requireRoles for server pages
      api-key.ts                      # External API keys: generateApiKey / verifyApiKey / effectiveScope (sk_live_, sha256 at rest)
    rag/
      embeddings.ts                    # OpenAI embedding + contentHash + estimateTokens
      taxonomy.ts                      # TaxonomyMeta types + matchesTaxonomyFilter (inheritance rule)
      retrieve.ts                      # SHARED retrieval core (retrieveDocuments) — used by /api/ask + /api/v1/search
      vision.ts                        # Gemini Vision — full-table extraction, 2000 max tokens
      ingest-products.ts               # Auto-derives taxonomy from product_lines.solution_id FK
      ingest-gitbook.ts                # Main chunks + focused LED chunks (chunk_index ≥ 10000)
      ingest-helpcenter.ts, ingest-google-doc.ts
      ingest-web.ts                    # Generic web page → Firecrawl→Jina→fetch cascade → chunk (source_type "web")
      chunk.ts                         # SHARED chunkText() for manual/uploaded pipelines (snippet + file)
      ingest-text-snippet.ts           # Manual markdown snippet → chunk → embed (source_type "text_snippet"; raw in chunk-0 meta)
      ingest-file.ts                   # Uploaded PDF extracted text → chunk → embed (source_type "file"; original in knowledge-files bucket)
      extract-pdf-ai.ts                # Gemini PDF→Markdown (tables/figures/scanned OCR); unpdf text-layer is the fallback
      ingest-wifi-regulations.ts       # WiFi RegHub API → per-country chunk, source_id = ISO code
      personas.ts                      # Persona + UserProfile
    google/
      auth.ts, drive-versions.ts, drive-images.ts
      docs.ts                          # Service Account first → public export URL fallback
      sheets.ts                        # cellToCleanValue (strikethrough filter) + pattern-based category detection
    datasheet/
      cover-layout.ts                  # Dynamic features/overview sizing + per-locale CJK metrics
      pagination.ts                    # Spec 2-col/multi-page split + mid-item (cont.) header
      layout-check.ts                  # Overflow heuristic (cover + spec), locale-aware
      layout-ack.ts                    # computeContentHash / isAckValid — hash-bound ack
      typography.ts
    translate/
    settings.ts                        # getApiKey() + API_KEY_MAP (wifi_reghub_api_key lives here)
  types/
    database.ts           # Hand-written: convenience aliases + narrow types (e.g. layout_ack)
    database.generated.ts # Auto-generated from Supabase; used by lib/supabase/{server,client}.ts
```

## Architecture & Data Flow

完整的同步機制、變更偵測、Telegram 通知流程詳見 [`docs/sync-and-notifications.md`](docs/sync-and-notifications.md)。

### 同步、狀態、圖片 → [`docs/datasheet-sync.md`](docs/datasheet-sync.md)

Google Sheets → Supabase 同步(欄位映射)、Product Status(active/upcoming/pending)、Smart Sync(Drive modifiedTime + deep diff)、sync 後 auto re-index RAG、locale-aware 圖片雙向同步(Drive 真源 ↔ Supabase 快取 ↔ MKT web upload write-through)。另見 [`docs/sync-and-notifications.md`](docs/sync-and-notifications.md)。

### Datasheet 渲染:PDF / 版面 / 多語言 → [`docs/datasheet-rendering.md`](docs/datasheet-rendering.md)

PDF 生成(Regenerate/New Version、Puppeteer 自我認證、Drive folder auto-create/dedupe、locale Draft 阻擋)、動態 cover 版面 + spec 2 欄分頁(`lib/datasheet/`,**locale-aware metrics 常數須對齊 preview CSS — pitfall #50/#51**)、多語言 datasheet(兩層翻譯、Draft/Confirmed、per-locale typography、5 層 AI 翻譯 prompt)。**改 PDF/版面/翻譯前先讀該檔。**

### Authentication & RBAC → [`docs/auth-rbac.md`](docs/auth-rbac.md)

三層強制:`proxy.ts`(session refresh + 公開路由白名單 `PUBLIC_PATH_PREFIXES`/`PUBLIC_EXACT_PATHS` + demo/workspace cookie 放行)→ `(main)/layout.tsx`(whitelist 檢查)→ per-route gates(`gate()`/`gateOrCron()`/`adminOnly()`/`requirePagePermission()` + client `can()`)。4 角色(admin/editor/pm/viewer)矩陣在 `lib/auth/permissions.ts`。PKCE sign-in(next 存 sessionStorage)、`handle_new_user` trigger、RLS recursion 用 `current_user_is_admin()`。**改 auth/proxy/權限前先讀該檔。**

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
auth.users → profiles ← email_whitelist.invited_by
```

Key tables:
- `solutions` — id, name, slug, label, color_primary, ds_template, sort_order, **kind** ('product'|'knowledge', 00021). `kind='product'` = 真實產品 solution（出現在 dashboard sidebar）；`kind='knowledge'` = 非產品「知識領域」（部門 SOP、新人 onboarding、公司跨部門共用…），**私有/opt-in**（產品/Global scope 撈不到，見檢索規則），可在 TaxonomyPicker tag + workspace「額外納入的知識領域」多選勾。已建：`marketing`(行銷部門)、`company`(公司共用)。**dashboard sidebar 篩 `kind='product'` 且 `product_line_count>0`**（沒產品線的 product solution 也不顯示，例 `cloud-platform`(Cloud 平台軟體)＝產品知識但無 datasheet）。知識領域可由 admin 在 workspace 編輯頁「+ 新增領域」自助建立（`/api/knowledge-areas` CRUD, knowledge.edit）。公開全公司知識則 tag 成 Global(solution=null)＝所有 workspace 都看得到
- `product_lines` — solution_id (FK), ds_prefix, ds_images_folder_id, drive_folder_id, sort_order, **spec_footnote** (TEXT, NULL=不顯示) + **spec_footnote_translations** (JSONB `{ja, zh-TW, ...}`) — 渲染在最後一個 spec page 兩欄下方的備註（如 VPN Firewall 的 `*Note: Performance figures…` 註腳）。**qr_url_template** (TEXT, NULL=用 dict default) — 該產品線的 QSG URL 模板，`{model}` 會替換成 lowercase model_name。已設定：Cloud VPN FW / NVS / Switch / **L3 Switch** / Extender 都用 `doc.engenius.ai/.../<model>` 結構（L3 Switch 跟 Cloud Switch 共用 `.../cloud-switch/{model}` 路徑）。**Cloud AP / Camera 維持短連結** `qr.engenius.ai/qsg/<model>`（PM 確認過）。Unmanaged Switch 待 PM 確認 QSG URL 結構。Resolution priority：`product_translations.qr_url` (per-locale override) → `product_lines.qr_url_template` → `dict.defaultQrUrl`
- `products` — status, current_version, **current_versions** (JSONB: `{"en":"1.1","ja":"1.0"}`)
- `versions` — version, **locale**, pdf_storage_path, changes, generated_at. **UNIQUE (product_id, version, locale)**（00013 migration 修；之前漏 locale 會 silent fail，見 pitfall #45）
- `change_logs` — per-product content diff history
- `image_assets` — radio_pattern 多張圖
- `product_translations` — per-product per-locale: headline, **subtitle**, overview, features, hardware_image, qr_label, qr_url, translation_mode, **confirmed**
- `spec_label_translations` — per-product-line per-locale: original_label → translated_label, label_type (spec/section)
- `translation_glossary` — english_term, locale, translated_term, scope (global/product-line), source (manual/feedback)
- `app_settings` — key-value store: API keys, `typography_${locale}`, `custom_fonts_${locale}`, `persona_{id}`, `pdf_lock_{model}_{lang}`
- `documents` — RAG 向量索引：source_type, content, embedding VECTOR(1536), metadata JSONB, content_hash
- `ask_workspaces` — 多租戶 Ask 入口（/ask/<slug>）：slug, name, enabled, passcode_hash (sha256), **llm_mode ('shared'|'byok'|'user_byok')**（00018 加 user_byok 到 CHECK）, provider, byok_provider, byok_key_encrypted (AES; 只有 workspace-BYOK 用), scope JSONB `{solution,product_lines[],models[],source_types[],knowledge_areas[]}`, persona/profile/allow_switch, welcome_*, rate_limit_per_min + daily_limit + window/day 計數. RPC `ask_workspace_touch(p_slug)` 原子化配額。RLS on + 0 policies = service role only。**`scope.knowledge_areas`** = 額外納入的 `kind='knowledge'` 領域 slug（產品 scope + 部門領域的加總，見下方檢索規則）
- `api_keys` — 對外 Search API key：name, key_prefix, key_hash (sha256, 驗證用), **key_encrypted** (AES-256-GCM, 供 admin 列表複製), scope JSONB `{solution,product_lines[],models[],source_types[]}`, rate_limit_per_min, enabled, last_used_at, request_count, window_start/window_count (固定視窗限流). RLS on + 0 policies = 只走 service role。RPC `api_key_touch(p_hash)` 原子化 verify+限流+用量
- `chat_sessions` — 對話持久化：user_id (default 'anonymous'), title, persona, provider, messages JSONB
- `profiles` — id (FK auth.users), email, name, avatar_url, role (TEXT CHECK admin/editor/pm/viewer), last_sign_in_at, timestamps. **role values are TEXT not enum** (we DROPped the orphan `user_role` enum during migration cleanup)
- `email_whitelist` — admin-managed pre-authorisation list. email (PK, lowercase), role, invited_by (FK profiles), invited_at, note. Trigger reads this on first sign-in to create matching profile

## Conventions

- Supabase query builders 是 **PromiseLike** 但不是完整 Promise → 要用 `as { data: T | null }`
- PDF preview 用 inline `<style>` + absolute positioning 排版，不用 Tailwind
- Loading states 用 `loading.tsx` skeleton pattern
- Drive 資料夾結構與命名規則詳見 [`docs/drive-folder-and-naming-rules.md`](docs/drive-folder-and-naming-rules.md)
- **API gate pattern**: 在每支寫入 API 開頭 `const denied = await gate("permission"); if (denied) return denied;`。Cron-callable 用 `gateOrCron(request, ...)` 變體
- **Page guard pattern**: server component 開頭 `await adminOnly()` / `await requirePagePermission("xxx")` — redirects 由 Next.js 處理
- **UI hide pattern**: 從 layout/page 拿 user role → 傳給 client component → 用 `can(role, "permission")` 包按鈕。三層 gate 都要做，少一層就有 hole
- **Supabase write error checking**: 所有 insert/update/upsert 結果都要看 `error`。helper 寫成 `throwIfDbError(label)(res)` 形式 surface 失敗。silent error swallow 是這個系統最久的雷（pitfall #45）
- **PDF gen UX**: 兩條路徑（print-toolbar、product-detail handleGeneratePdf）都用 `toast.loading` → `toast.success` with `Open PDF` action button，不直接 `window.open`（pitfall #47）

### UI Layout Conventions

- **Dashboard 兩行 toolbar**: Row 1 = product line tabs；Row 2 = Active toggle | Compare Changelog **Translations** | Sync + **Lang column** 顯示已啟用語言 badges
- **Product page sticky header**: `sticky top-14 z-20` — model name + version badge + buttons 固定
- **Breadcrumb**: 簡化為 `[ProductLine] / [Model]`，ProductLine 連結帶 `?line=` 回正確 tab
- **Dashboard 表格欄位**: #, Model#, Model Name, Version, **Lang**, Last Changed, OV, FT, Prod, HW, [Radio Pattern], Actions
- **Solution sidebar**: 預設收合（`collapsed: true`），只顯示 icon
- **Datasheet 佈景**: Cloud = 藍色 `#03a9f4`，Unmanaged = 灰色 `#58595B`（由 `product_lines.category` 判斷）

## Ask SpecHub (RAG System)

Full context moved to [`docs/rag-context.md`](docs/rag-context.md) —
read it when working on Ask / RAG / knowledge base features. Quick
pointers so you know it exists:

- **UX**: Navbar Ask → right-side slide panel; SSE streaming from
  `/api/ask`; inline `[1]` citations with `CitationTooltip`
- **Knowledge sources**: 8 pipelines under `src/lib/rag/ingest-*` (product_spec,
  gitbook, helpcenter, google_doc, wifi_regulation, **web**, **text_snippet**,
  **file**) → `documents` table (pgvector); taxonomy meta on every chunk.
  text_snippet (manual markdown, raw kept in chunk-0 meta for re-edit) + file
  (PDF-only: Gemini AI extraction in `lib/rag/extract-pdf-ai.ts` → tables/figures/
  scanned OCR, unpdf text-layer fallback; original in private `knowledge-files`
  bucket; indexed text via shared `lib/rag/chunk.ts`) are manual/uploaded, so the
  weekly `/api/cron/reindex-web` only refreshes gitbook/google_doc/helpcenter/web
  (derives sources from `documents`, preserves taxonomy). Files upload via
  multipart `POST /api/documents/upload`; `GET /api/documents/file-url` mints a
  60s signed URL for "view original"; text snippets go through `POST /api/documents`
  (source_type text_snippet) with a `?raw=1` GET to reload for editing
- **Cross-lingual re-rank**: `/api/ask/route.ts` supplements embedding
  results with literal model/country lookups to compensate for
  `text-embedding-3-small` weakness on CJK query → EN chunk matching
- **3 Personas × 4 User Profiles** configurable in Settings

### 兩個聊天介面共用同一個串流引擎（重要）

有**兩個** Ask 聊天 surface，但**行為共用、外觀分流**：
- `components/ask/ask-chat.tsx` — 桌機/網頁 panel（內部、工具感、inline 引用、對話歷史）
- `components/demo/engenie-chat.tsx` — `/demo/ask`（對外 passcode + iOS PWA、溫暖紙感、隱藏 inline 引用）

**串流核心只有一份**：`hooks/use-chat-stream.ts`（`useChatStream`）擁有 messages/loading/loadingStatus、rAF 批次串流、停止(AbortController)、重新生成、最終解析，回傳 referentially-stable 的 `submit`/`stop`/`regenerate`（可直接傳給 memoized 訊息列）。配 `hooks/use-stick-to-bottom.ts`（貼底才跟，距底 80px 閾值）+ `components/chat/code-block.tsx`（語言標籤+複製+hljs 高亮，當 react-markdown 的 `pre`）。**改串流行為只改 hook，兩版同步生效；新增聊天 surface 一律複用這三個檔，不要再複製串流邏輯**。回答結構由 `/api/ask` 的 FINAL OUTPUT CONTRACT 強制（開門見山、表格比較、粗體型號、語言對齊）。完整規範見 [`docs/ask-chat-ux-spec.md`](docs/ask-chat-ux-spec.md)（HTML 好讀版 `public/docs/ask-chat-ux-spec.html`，服務於 `/docs/ask-chat-ux-spec.html`）。
- 桌機 markdown 樣式 = `globals.css` 的 `.ask-markdown`（15px/1.75，inline code 用 `:not(pre) > code` 才套）；demo = Tailwind `prose`（需 `@tailwindcss/typography` plugin）。`@import "highlight.js/styles/github-dark.css"` 提供 code token 配色

### 對外 RAG Search API（其他部門 app 串接）

檢索核心抽成 **`lib/rag/retrieve.ts`（`retrieveDocuments`）**，`/api/ask` 與對外 API **共用同一份**（不要再各寫一份）：embed → `match_documents` RPC → taxonomy filter → 跨語言 literal-match 補強（型號/國家）→ re-rank → trim。`sourceTypes`(allow-list) 與 `strictScope` 是給 API 的（聊天不開，保留原行為）。

- **知識領域預設「私有」（`knowledgeAreasAllowed` 選項）**：`kind='knowledge'` 的 solution（部門 SOP/onboarding/平台）**不會**被產品或 Global scope 撈到。retrieve 帶 `knowledgeAreasAllowed`（陣列，含空陣列）時 = workspace 模式：凡 doc 的 solution 屬於某 knowledge 領域,**只有**該 slug 在 allow-list 內才保留。`undefined`（內部 Ask / Search API）= 不過濾,全看得到。`/api/ask` workspace 分支把 `scope.knowledge_areas` + (若 `scope.solution` 本身就是 knowledge 領域則含它) 當 allow-list。⇒ 「全產品 + 行銷」= 產品 scope Global + `knowledge_areas:['marketing']`；純 onboarding bot = `solution:'marketing'`。TaxonomyPicker 的 `productOnly` 讓 workspace 產品 scope 只列 `kind='product'`,部門領域改用「額外納入的知識領域」多選勾。

- **`POST /api/v1/search`**（`app/api/v1/search/route.ts`，maxDuration 30）：對外、機器對機器、回 **JSON**（非 SSE，無 LLM 成本）。body `{ query(≤2000), top_k?(1–20,預設8), source_types?, taxonomy? }` → `{ ok, count, results:[{content,title,source_type,source_id,source_url,score,taxonomy}], scope }`。
- **認證**：`Authorization: Bearer sk_live_…`。驗證用 sha256 `key_hash`（不需解密）。`api_key_touch(p_hash)` RPC **原子化**做 驗證 + 固定視窗(60s)限流 + 用量累加；`verifyApiKey()` 回 401(無/錯 key)/403(停用)/429(超量)。
- **可從列表複製 key**：另存 `key_encrypted`（AES-256-GCM，金鑰由 env `API_KEY_ENC_SECRET` 派生、**不在 DB**）。admin 按列表「Copy key」→ `GET /api/api-keys?reveal=<id>` 解密回傳一次。`encryptKey`/`decryptKey` 在 `lib/auth/api-key.ts`。沒設 env 或舊 key 無 `key_encrypted` → reveal 回 409（要求重發）。
- **Scope = 每把 key 的天花板，server 端強制**：`effectiveScope()` 把請求範圍 ∩ key scope，請求**只能縮小不能放大**（選到範圍外 fallback 回 ceiling，不外洩）。scope 各欄留空 = 全部。`strictScope:true` 在 retrieve 末端再過濾一次，防補強的 literal match 漏出範圍外 chunk。
- **proxy**：`/api/v1/` 在 `PUBLIC_PATH_PREFIXES`（跳過 session gate，路由自己做 key auth + 回 JSON 401；**不能**讓 API client 吃到 HTML 導向）。**不開 CORS**（強制 server-to-server，避免 key 暴露在瀏覽器）。
- **管理 UI**：`/settings/api-access`（admin，權限 `settings.manage_api_access`）發/設 scope/停用/刪除/看用量；CRUD 在 `app/api/api-keys/route.ts`。
- 給串接部門的完整對外規格見 [`docs/api-search.md`](docs/api-search.md)。
- **對外消費(兩種)**：(a) 部門自寫 app → 讀 `docs/api-search.html`(已公開);(b) 同事用 Claude Code → 裝 `engenius-kb` skill(獨立公開 repo **github.com/terrelyeh/claude-skills**,一行 `install.sh`,讀 env `SPECHUB_API_KEY`)。`/settings/api-access` 頁面把「API 文件 + skill 安裝指令」兩張卡並排,admin 在此發 key 並一鍵複製連結給同事。skill 原始檔也在本機 `~/.claude/skills/engenius-kb/`。

### Ask Workspaces（多租戶 /ask/&lt;slug&gt;）

讓其他部門有**自己的 Ask 聊天入口**,共用同一個知識庫但各自 scope/key/角色。**沒有複製串流邏輯** —— `/api/ask` 用一個可選的 `workspace` 參數承載 workspace 模式。

- **入口** `/ask/<slug>`(`app/(demo)/ask/[slug]/page.tsx`)：重用 demo 的 `EngenieGate`/`EngenieShell`/`EngenieChat`(都加了 `workspace`/`title` props)。shell GET `/api/ask?workspace=<slug>` 取設定、POST 帶 `workspace`。
- **passcode**：`lib/auth/workspace-session.ts` —— cookie `ws_<slug>` = HMAC(`ws:<slug>`, key=`API_KEY_ENC_SECRET`),Edge+Node 皆可驗(免 DB,slug 在 cookie 名裡)。`/api/ws-auth` 驗 passcode(sha256 比對 `passcode_hash`)後發 cookie。
- **三種 LLM 模式**（`llm_mode`）：
  - `shared` —— 用系統共用 key + 配額。
  - `byok`（workspace-BYOK）—— admin 設**一把** key（`byok_key_encrypted`，AES），整個 workspace 共用；`/api/ask` 用 `decryptKey()` 當 override。
  - `user_byok`（**使用者各自帶 key**）—— 每位訪客在前台輸入自己的 key，存在**自己的瀏覽器**(`lib/demo/byok.ts`,localStorage `engenie_byok_key_v1_<slug>`)，隨每次 POST 帶 `userKey` 給 `/api/ask`，**不落地/不寫 log/不進歷史**。沒帶 key 時 `/api/ask` 回 `{ code:'user_key_required' }`,前台鎖住輸入框並提示。
- **`/api/ask` 擴充**：帶 `workspace` 時 → `loadWorkspaceBySlug` → 驗 ws cookie → `ask_workspace_touch` RPC(每分/每日配額)→ 用 ws 的 scope 檢索(`strictScope`)、persona/profile/provider 預設(`allow_switch=false` 則鎖定,**且前端 `EngenieShell`/`EngenieDrawer` 也會隱藏切換器並套用預設值**)、按 `llm_mode` 決定生成 key(`byok`→workspace key、`user_byok`→`body.userKey`)。沒帶 `workspace` → 原本的 `gateAskOrDemo()`,行為不變。
- **streamClaude/OpenAI/Gemini** 都加了選用 `apiKeyOverride`(BYOK 注入點;省略則 `getApiKey()`)。
- **歷史按 workspace 隔離**：`lib/demo/history.ts` 的 key 改成 `engenie_history_v1_<slug>`(/demo/ask 無 slug 維持原 `engenie_history_v1`)。仍是 per-browser localStorage(無痕關閉所有視窗才清,**不**同步伺服器)。
- **BYOK 防呆**：`workspace-BYOK` 沒 key 不可建立/啟用(`app/api/ask-workspaces/route.ts` POST+PATCH 擋,逃生門=改 shared/user_byok、填 key、或先停用);執行期 `/ask/<slug>` 若 `byok` 且無 key → 顯示「尚未設定完成」notice 而非可打字的假聊天框。`user_byok` 不需要 admin key。
- **proxy**：`/ask/` + `/api/ws-auth` 公開;`/api/ask` 在帶**任一合法 `ws_*` cookie** 時放行(`hasAnyValidWorkspaceCookie`)。
- **管理**：`/settings/ask-workspaces`(admin)+ `app/api/ask-workspaces/route.ts` CRUD。secrets(passcode/BYOK key)write-only。「Copy URL」「Embed」並排:Embed 複製浮動 widget 的 `<script src=".../widget.js" data-workspace=…>` snippet。
- **嵌入式浮動 widget(Intercom 式)**:其他部門在自己網站貼一段 `public/widget.js` snippet → 右下角浮動按鈕 → 開啟 iframe 載入 `/embed/<slug>`(`app/(demo)/embed/[slug]/page.tsx` → `components/demo/engenie-embed.tsx`)。**跨站 iframe 第三方 cookie 會被擋**,所以 embed 改用 **bearer token**:`/api/ws-auth` 回傳 token → 存 iframe localStorage(`lib/demo/ws-token.ts`)→ 每次呼叫 `/api/ask` 帶 `Authorization: Bearer <slug>.<token>`。後端 `workspace-session.ts` 的 `parseWorkspaceBearer`/`isValidWorkspaceBearer` 驗證;`/api/ask` GET+POST 與 proxy 都接受 cookie **或** bearer。沒設 passcode 的 workspace 會自動進入(無摩擦對外 widget)。CORS 不用開(iframe 內同源呼叫)。v1 不限制嵌入網域。
- ⚠️ `user_byok` 若 `allow_switch=true`,使用者可能選到跟自己 key 不同家族的模型(provider 會報錯)——通常建議把模型鎖死(`allow_switch=false`)。per-workspace 配額對 user_byok 仍生效。
- 規劃 Phase 2(部門私有文件自助索引)見 [`docs/ask-workspaces-phase2-plan.md`](docs/ask-workspaces-phase2-plan.md)。

## Current Status

功能清單詳見 [README.md](README.md)。

### 🔜 Next Steps

**RAG**：
1. **Ask Workspaces Phase 2** — 部門私有文件「自助」上傳 + 自動索引 + 隔離。完整計畫書見 [`docs/ask-workspaces-phase2-plan.md`](docs/ask-workspaces-phase2-plan.md)
2. **Knowledge 上傳優化（可選）** — >4MB PDF 走瀏覽器直傳 Storage（避開 Vercel ~4.5MB body 限制）；Word 支援（先轉 PDF 再走 Gemini 抽取那條）
3. **更新 `docs/rag-system.md`** — 反映 SSE/citations/taxonomy/wifi_regulation + text_snippet/file 來源 + 嵌入式 widget
4. **回頭補 helpcenter 的 taxonomy tag**（gitbook 已可標：Add Space 對話框有 TaxonomyPicker、展開檢視每個 space 有「Edit tags」套用到整個 space；helpcenter 的自訂檢視仍缺 Edit tags，可比照 gitbook 補上）

**Datasheet 系統**：
4. **多國語言擴展到其他產品線** — 需為 AP/Switch/NVS/VPN FW 建立 product-line prompt
5. **翻譯 feedback 偵測** — Save 時偵測使用者修改，建議加入詞庫
6. **多張 Hardware 圖支援** — front/rear/bottom 最多 3 張
7. **Resync versions per-locale** — 目前 `/api/resync-versions` 只更新 EN。未來掃 ja/zh-TW Drive 資料夾把 `current_versions.{ja,zh-TW}` 也同步
8. **新增第 4 個翻譯語言（如 Spanish / es）** — 動 8 個檔案：
   - `locales/types.ts` 加 `"es"` 到 union + `SUPPORTED_LOCALES`
   - `locales/es.ts` 新建 dict（datasheet/overview/disclaimer 等 UI 文案）
   - `locales/index.ts` 註冊
   - `cover-layout.ts` `LOCALE_METRICS.es`（拉丁字母可抄 EN 但西文比英文長 ~20%，可能要 charsPerLine -1)
   - `typography.ts` `TYPOGRAPHY_DEFAULTS.es`（拉丁字母可抄 EN）
   - `translate/prompts/locales/es.ts` AI 翻譯規則
   - `translate/index.ts` 註冊 `es: esLocalePrompt`
   - `getLocaleSuffix()` 預設 fall-through 直接用 `es`，無需動

   PM 操作：產品頁 Translations tab → Enable Spanish → AI Translate → Save & Confirm → Generate PDF。Drive 資料夾 `<line>_es` 會自動建。Spec label 翻譯走 `/translations/[line]` 頁面（optional）

**系統**：
8. **Review Workflow** — Phase 2 計畫 (PM approve content → MKT generate)。設計 plan 已在對話中討論定案，等實作。需要 `products.review_approval` JSONB + content-hash bound + 在 `/api/generate-pdf` 加 approval gate
9. **Auto invite email** — 目前 admin 邀請後要手動 Slack/email 對方告知白名單已加好，可整合 Resend / Supabase email 自動寄

## Deployment

```bash
npm run dev    # Local dev server (port 3000)
npm run build  # Production build
npm run lint   # ESLint check
```

- Vercel 自動部署 main branch
- Vercel Cron: `vercel.json` → `"0 1 * * *"` (每天 09:00 台灣時間)
- **⚠️ Vercel function region 釘在 `hnd1`（東京）** — `vercel.json` 的 `"regions": ["hnd1"]`。**不要改掉**。Supabase 在 `ap-northeast-1`（東京），function 一定要同區，否則每個 DB query 跨太平洋 ~170ms（之前預設 iad1 美東，一個頁面 3-5 個 query 浪費 600-900ms）。同區後 ~5ms。改 region 前先確認 Supabase 也在哪
- **Server component query 並行化** — 高流量頁面（product detail、dashboard）已用 `Promise.all` 把互相獨立的 Supabase query 並行（避免 waterfall）。加新 query 前先想「這個 query 依賴前面的結果嗎？不依賴就塞進同一個 Promise.all」
- 需要的 env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `CRON_SECRET`, `API_KEY_ENC_SECRET`（對外 API key 加密；未設則無法從列表複製 key）
- 可選 env vars: `FIRECRAWL_API_KEY`（web 來源優先用 Firecrawl 萃取；未設則退到 Jina Reader），`JINA_API_KEY`（提高 Jina rate limit）
- AI 翻譯 env vars（可選，也可在 Settings 頁面設定）：`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`

## Common Pitfalls

> Pitfalls #1–#44, #46, #48 archived to [`docs/common-pitfalls.md`](docs/common-pitfalls.md)
> (RAG, layout metrics, auth setup, OAuth flow, Drive folder rules, Puppeteer
> auth, Toaster mounting — all stable / specific-subsystem). Inline below are
> the active / cross-cutting ones a new session is most likely to hit
> (Supabase write hygiene + browser popup + layout rendering). Numbers
> preserved.

45. **Supabase silent insert/update 是這個系統最久的雷** — supabase-js 的 write 不 throw on error，回 `{ data, error }`。歷史教訓：`versions` table unique constraint 漏 locale → INSERT 撞 dup key → silent fail → `products.current_versions` 仍被更新成假裝 PDF 存在 → UI 顯示 "Regenerate v1.0" 但 row 跟 Drive 都空。慣例：所有 supabase write 一律 `throwIfDbError(label)(res)` 包起來。00013 migration 已修 versions constraint 加 locale

47. **Browser popup blocker 會擋 async-after `window.open`** — `await fetch(...)` 等了幾十秒後再 `window.open(pdf)`，Chrome/Safari 不認為是 user gesture → 靜默吞掉。修法：用 `toast.success(..., { action: { label: "Open PDF", onClick: () => window.open(...) } })` — toast 上的 click 是真實 user gesture，瀏覽器一定放行

49. **Translation Save & Confirm 不能綁 `dirty`** — 翻完 AI translate → dirty=true → 按 Preview（auto-save 但不傳 `confirm:true`，dirty 變 false）→ Save & Confirm 永遠灰，使用者卡在 Draft 出不來。修法：Save 條件改成「有翻譯內容 AND (locale 還是 Draft OR dirty)」— Draft 永遠可按，已 Confirmed 才需要 dirty。同時 Preview 對 Draft locale 跳 toast 提醒；Draft 狀態下按鈕用 amber + pulse 視覺強調。三層一起做才完整

50. **Pagination 常數一定要對齊實際 CSS（多輪 calibration 史）** — `AVAILABLE_HEIGHT = 792 - TOP_BAR - SPEC_TITLE - BOTTOM_MARGIN`。任何一個常數低估都會讓 fitSection 以為還有空間，實際 rendering 多塞 → 內容貼頁碼。歷史教訓累積：(a) `SPEC_TITLE_HEIGHT` 原 42pt → 62pt（漏算 padding-top 27pt + margin-bottom 18pt）；(b) `SPEC_BASE_ROW_HEIGHT` 原 20pt → 22pt → 23pt（EN 實際 ~22.3pt + 餘裕）；(c) `CATEGORY_HEADER_HEIGHT` 原 18pt → 22pt（漏算 margin 8pt）；(d) **CJK row metrics 要更大** — JA 24pt / zh-TW 25pt（CJK 字型 leading ~1.3 vs Latin ~1.2，每行多 1.5-2pt，36 items 累積 50pt+ drift）。`splitIntoPages(sections, locale)` 必須傳 locale 才會用對 metrics。Overview overflow 判斷也加 12pt safety buffer。每改 preview/[model] CSS 必須同步檢查這些常數

51. **`balanceColumns` 要用「高度」+ `splitOccurred` flag 必設** — 兩個合作 bug 才會爆：(a) `balanceColumns()` 原本用 item 數平均分配（左 19 / 右 17 items 看似平衡，但右欄總高 760pt 超過可用 657pt → Package Contents 被截）→ 改成枚舉所有 split index 挑 `|leftH - rightH| + overflow_penalty` 最小的切點；(b) `fitSection` 在「有內容 + partial split」分支沒 set `splitOccurred = true` → 流程末端 `if (!splitOccurred) balanceColumns()` 把 fitSection 切好的好版面覆寫成 count-based 爛版面。兩個分支（左/右欄）都要 set 旗標

52. **Features 排列改 balanced column-first（不是 height-greedy）** — 舊算法「每個 item 進當前最矮的欄」會交錯（1,3,5 / 2,4,6）破壞 PM 寫的優先順序。新算法：順序填左欄到接近總高一半，剩下進右欄。同時保留閱讀順序 + 視覺平衡。ECW560 案例（前 3 個 3-行 item + 後 8 個 1-行）：左 3 個（9 行）/ 右 8 個（8 行），順序+平衡兩全

53. **新產品線設定容易把 `drive_folder_id` 跟 `ds_images_folder_id` 填反** — PM 給的 Drive folder URL 如果是 DS Images 子資料夾，填到 `drive_folder_id` 會讓 PDF 上傳失敗 + 圖片進錯位置。L3 Switch 上線時就踩過：DB 寫 `drive_folder_id = NULL` + `ds_images_folder_id = <root_id>`，正確應該是 root → drive_folder_id、DS Images → ds_images_folder_id。設定新產品線時必須跟 PM 確認**這兩個欄位指的是不同層級**：drive_folder_id 是「產品線」資料夾、ds_images_folder_id 是裡面的「DS Images」子資料夾

54. **`useChatStream` 組 POST body 一律用 `...getParams()` 展開，別寫死欄位清單** — `hooks/use-chat-stream.ts` 曾把 body 寫死成 `{question, provider, persona, profile, history}`，但 `getParams()` 回傳的額外欄位（`workspace`、`userKey`、未來的 `taxonomy` 等）因此**被靜默丟掉**，從沒送到 `/api/ask`。後果：每個 workspace 提問都掉進 `else`（一般 RBAC `gateAskOrDemo()`）→ 無痕未登入回 `401 "Unauthorized — sign in required"`，且 scope/BYOK/persona 鎖定全被繞過。**最毒的是它「看起來能用」**——GET（welcome/personas 走 query param）正常、頁面照載、輸入框能打字，只有真的送出才壞；又因為 `ask_workspace_touch` 在 workspace 分支內才呼叫，`request_count` 一直是 0（debug 時這就是「POST 從沒進過 workspace 分支」的鐵證）。Phase 1 當時只用登入的 admin 測（else 分支剛好 gate 通過）才沒抓到。修法：`const params = getParams(); body: {question, ...params, history}`，並把 `getParams` 型別加 index signature，讓新增欄位不用再動 hook。**新增任何 per-request 欄位時，確認它真的進了 body，別只加進 getParams。**

## 詳細文件

- [`docs/common-pitfalls.md`](docs/common-pitfalls.md) — Pitfalls archive #1–#25（早期特定 feature 的踩雷紀錄）
- [`docs/rag-context.md`](docs/rag-context.md) — Ask SpecHub / RAG 完整架構
- [`docs/api-search.md`](docs/api-search.md) — 對外 RAG Search API 規格（給其他部門串接：認證、參數、回傳、scope、限流、錯誤碼、範例）
- [`docs/ask-workspaces-phase2-plan.md`](docs/ask-workspaces-phase2-plan.md) — Ask Workspaces Phase 2 計畫書（部門私有文件自助索引：資料模型、隔離、上傳/解析、權限、工時估）
- [`docs/ask-chat-ux-spec.md`](docs/ask-chat-ux-spec.md) — Ask 聊天互動規範（兩介面共用引擎、動態效果、格式樣式、回答契約；給 RD/PM 參考。HTML 版 `public/docs/ask-chat-ux-spec.html`）
- [`docs/sync-and-notifications.md`](docs/sync-and-notifications.md) — Sync 機制 + Telegram 通知流程
- [`docs/datasheet-sync.md`](docs/datasheet-sync.md) — Google Sheets 同步、product status、locale-aware 圖片雙向同步（細節）
- [`docs/datasheet-rendering.md`](docs/datasheet-rendering.md) — PDF 生成、cover/spec 版面（lib/datasheet/）、多語言 datasheet + AI 翻譯（細節）
- [`docs/auth-rbac.md`](docs/auth-rbac.md) — 認證/proxy/RBAC 三層、權限矩陣、sign-in flow、RLS（細節）
- [`public/docs/drive-folder-and-naming-rules.html`](public/docs/drive-folder-and-naming-rules.html) — Drive 資料夾結構、檔名規則、Detail Specs 填寫規則
