# Ask SpecHub (RAG System) — Context for AI Sessions

> Extracted from `CLAUDE.md` 2026-04-22. Read this when working on RAG /
> Ask / knowledge base features. For datasheet / PDF / sync work you
> don't need this file.

## UX 架構
- **Slide Panel**：Navbar Ask 按鈕 → 右側 panel 滑出（600px / 42vw），不離開當前頁面
- **SSE Streaming**：`/api/ask` POST 回傳 `text/event-stream`。三家 LLM 都用 streaming（streamClaude/streamOpenAI/streamGemini）
- **Inline Citations**：LLM 回答用 `[1]` `[2]` 標記。`CitationTooltip` hover 顯示來源。連結規則：外部 `http` URL（gitbook/helpcenter/google_doc）+ 內部相對路徑（`wifi_regulation` → `/wifi-regulation/{CODE}`）可點擊；`product_spec` 目前不可點擊
- **UI Path Styling**：`**Configure > Gateway > VPN**` 自動渲染為 breadcrumb pill
- **Welcome Screen**：可自訂（`app_settings`: `ask_welcome_subtitle/description/example_questions`）

## Persona & Profile
- **3 Personas**：Product Specialist（預設）、Sales Assistant、Technical Support
- **4 Profiles**：同事（預設）、業務/Channel、產品經理、終端客戶
- **核心原則**：禁止客套開場白、Feature-Benefit、站在對方立場、寧多勿少
- Persona prompt 在 `personas.ts` 的 `DEFAULT_PERSONAS`；Profile 在 `USER_PROFILES`

## 知識庫 Source Types

| Type | Pipeline | 備註 |
|---|---|---|
| `product_spec` | `ingest-products.ts` | 每 product 2 chunks (overview + specs)。taxonomy 從 product_lines.solution_id FK 自動帶入 |
| `gitbook` | `ingest-gitbook.ts` | sitemap → fetch → chunk → Vision describe images。QSG 額外產出 focused LED chunks (chunk_index ≥ 10000) |
| `helpcenter` | `ingest-helpcenter.ts` | Intercom SPA fallback 用 `KNOWN_ARTICLES` |
| `google_doc` | `ingest-google-doc.ts` | Service Account Drive API → public export fallback。Tab split by `\[vX.X\]` markers |
| `wifi_regulation` | `ingest-wifi-regulations.ts` | WiFi RegHub API → 1 chunk per country (ISO code = source_id)，markdown 已預格式化 |
| `web` | `ingest-web.ts` | 任意網頁 → Firecrawl(有 `FIRECRAWL_API_KEY` 時)→ Jina Reader → 純 fetch 清洗 的層疊萃取 → markdown chunk。source_id = hostname+pathname（無 colon），source_url 存完整網址。`/knowledge` Add Page 加入；每週 cron 重抓 |

## Unified Taxonomy (Solution > Product Line > Model)

所有 source types 在 `documents.metadata` 共用三個 optional 欄位：
```typescript
{
  solution: string | null,      // solutions.slug 或 null = global
  product_lines: string[],      // product_lines.name[]，[] = 套用整個 solution
  models: string[],             // products.model_name[]，[] = line-level
}
```

**繼承規則**（`lib/rag/taxonomy.ts` 的 `matchesTaxonomyFilter`）：當使用者以 `product_lines: ["Cloud Camera"]` filter 檢索，同時包含 **(a)** 該 doc 的 `product_lines` 包含 `"Cloud Camera"`、**(b)** 該 doc 的 `product_lines` 為空（代表套用整個 solution → 自動涵蓋 Camera）。`matchCount=40` 先抓多，app-level filter 後再 trim 到 12。

**Auto-tagging**：product_spec 自動從 DB FK 推；其他 source 透過 UI `TaxonomyPicker` 或 API 的 `taxonomy` 參數顯式指定。`PATCH /api/documents` 可 backfill 既有 chunks 的 taxonomy 而不重跑 ingest。

## 檢索 Re-rank（Cross-lingual）

`text-embedding-3-small` 對跨語言短查詢（中文問題對英文 chunk）retrieval 偏弱。`/api/ask/route.ts` 加了兩層 literal-match supplementary lookup：

- **Model-mention**：regex 偵測 `ECW536` / `EVS1004D` 等型號 → 直接 ILIKE 查 gitbook/product_spec，另外專門撈 `chunk_index ≥ 10000` 的 focused chunks（繞開 similarity 排序）
- **Country-mention**：20 個主要市場的多語 alias map（英/中/ISO code）→ `wifi_regulation` 用 `source_id` 直接查

Unified re-rank 評分：`modelMatch*10 + focusedLed*5 + countryMatch*20 + similarity`。這樣即使 embedding 分數低，literal match 仍能浮到頂。

## 流程總覽

```
question + history → searchQuery embed → match_documents RPC (top 40)
  → (optional) taxonomy filter → (optional) supplementary lookup (model/country)
  → unified re-rank → trim to 12 → prompt → SSE stream LLM → answer + citations + follow-ups
```

資料表：`documents`（向量索引，metadata JSONB 含 taxonomy + source-specific fields）、`chat_sessions`（對話持久化）

## 共用檢索核心 + 對外 Search API

檢索（embed → match_documents → taxonomy filter → 跨語言補強 → re-rank → trim）抽在 **`lib/rag/retrieve.ts`（`retrieveDocuments`）**，`/api/ask`（聊天 SSE）與 **`/api/v1/search`**（對外 JSON）共用同一份。

對外 API 供其他部門 app 串接（**只給檢索片段，不生成回答**）：`POST /api/v1/search`，`Authorization: Bearer sk_live_…`，每把 key 綁 server 端強制的 scope（solution/product_lines/models/source_types，請求只能縮小）+ 固定視窗限流。管理在 `/settings/api-access`。完整規格見 [`api-search.md`](api-search.md)。
