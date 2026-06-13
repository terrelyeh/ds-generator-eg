# Ask SpecHub — RAG System

> Retrieval-Augmented Generation for EnGenius Product Specifications
> Last updated: 2026-04-12

## 1. Overview

**Ask SpecHub** is an AI-powered product query assistant built into Product SpecHub. Colleagues can ask natural language questions (Chinese or English) about EnGenius products. The system retrieves relevant data from the vector database and generates accurate answers with source citations.

### Capabilities
- Spec queries: "ESG510 的 VPN throughput 是多少？"
- Product comparisons: "ECC100 和 ECC500 差在哪裡？"
- Filtered search: "哪些 AP 支援 WiFi 7？"
- Recommendations: "推薦一台適合戶外的攝影機"
- Follow-up questions: "那你可以幫我比較這幾台的規格嗎？"
- Multilingual: auto-detects question language and responds accordingly

### Key Terms
| Term | Description |
|---|---|
| **RAG** | Retrieval-Augmented Generation — search first, then LLM answers based on retrieved context |
| **Embedding** | Text → 1536-dim vector. Semantically similar text = close vectors |
| **pgvector** | PostgreSQL vector search extension, built into Supabase (all plans including free) |
| **Chunk** | A document split into smaller pieces, each independently embedded and searchable |
| **Persona** | A system prompt profile that defines the AI's answering style for different audiences |

## 2. Architecture

### Query Workflow
```
User question (+ conversation history)
    → Enrich query with history context
    → Embed (OpenAI text-embedding-3-small)
    → Vector search (pgvector, top 8)
    → Load Persona system prompt
    → Build context (history + matched docs + question)
    → LLM answer (Claude/GPT/Gemini — user selects model)
    → Response + source citations
    → Auto-save to chat_sessions DB
```

### Indexing Workflow
```
Products DB → Build chunks (overview + specs per product)
→ Content hash check (skip unchanged) → Batch embed (OpenAI)
→ Upsert to documents table
```

## 3. Database Design

### `documents` table (universal, all source types)

```sql
documents (
  id UUID PRIMARY KEY,
  source_type TEXT NOT NULL,       -- 'product_spec' | 'gitbook' | 'web' | 'google_doc' | 'file' | 'text_snippet'
  source_id TEXT NOT NULL,         -- model_name, URL, Doc ID, etc.
  source_url TEXT,                 -- for citation in answers
  title TEXT NOT NULL,
  chunk_index INT DEFAULT 0,
  content TEXT NOT NULL,
  token_count INT,
  metadata JSONB DEFAULT '{}',     -- product_line, locale, tags, images, etc.
  embedding VECTOR(1536),          -- OpenAI text-embedding-3-small
  content_hash TEXT,               -- SHA-256, skip re-embed if unchanged
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

### `chat_sessions` table (conversation persistence)

```sql
chat_sessions (
  id UUID PRIMARY KEY,
  user_id TEXT DEFAULT 'anonymous', -- future: Supabase Auth user ID
  title TEXT,                       -- auto-generated from first user message
  persona TEXT DEFAULT 'default',
  provider TEXT DEFAULT 'gemini-flash',
  messages JSONB DEFAULT '[]',      -- array of {role, content, sources?, provider?}
  message_count INT DEFAULT 0,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

### Indexes
- `documents_embedding_idx` — IVFFlat cosine for vector search
- `documents_source_type_idx` — filter by source type
- `documents_source_chunk_unique` — prevents duplicate chunks on re-embed
- `chat_sessions_user_idx` — list user's sessions by updated_at desc

### `match_documents()` RPC function
Performs vector similarity search with optional `source_type` and `metadata` filters.

### Source Types (planned)

| source_type | Status | Description |
|---|---|---|
| `product_spec` | **Done** | Product overview + specifications from DB |
| `text_snippet` | Planned | Manual text entries (FAQ, competitive analysis) |
| `gitbook` | Planned | Gitbook documentation pages |
| `google_doc` | Planned | Google Docs via Drive API |
| `web` | Planned | Web page content |
| `file` | Planned | Uploaded Word/PDF files |

## 4. AI Involvement

Two AI calls per query:

### Step 1: Embedding (text → vector)
- **Model**: OpenAI `text-embedding-3-small` (1536 dims)
- **Cost**: $0.02/1M tokens (~$0.001 for all 66 products)
- **When**: indexing (per chunk) + each user question

### Step 2: LLM Answer (context + question → answer)
- **Models**: user-selectable per provider (see Model Selector below)
- **System prompt**: loaded from Persona, includes clarification + honesty rules
- **Anti-hallucination**: prompt instructs "NEVER fabricate specs not in context"
- **Clarification**: AI asks follow-up questions when user's question is vague
- **Language**: auto-detect from question

### Available Models

| Provider | Strongest | Mainstream | Best CP |
|---|---|---|---|
| **Gemini** | 2.5 Pro | 2.5 Flash (default) | 2.0 Flash Lite |
| **GPT** | 4o | 4o Mini | 4.1 Nano |
| **Claude** | Opus 4 | Sonnet 4 | Haiku 3.5 |

Users select provider first, then pick a specific model from a dropdown showing tier badges.

## 5. Chunking Strategy

Each product generates **2 chunks**:
- **Chunk 0 (Overview)**: model name, subtitle, overview text, key features
- **Chunk 1 (Specs)**: full specification table in `[Category] label: value` format

Target: 300-800 tokens/chunk. Product specs are naturally small, no complex splitting needed.

### Per-Source Chunking (future)

| Source | Strategy | Notes |
|---|---|---|
| product_spec | Fixed 2 chunks/product | Already implemented |
| gitbook | Split by heading (h1/h2/h3) | Markdown = natural split points |
| google_doc | Split by heading + recursive | Handle docs with/without headings |
| web | Readability extract + section split | Remove nav/footer/ads first |
| file (PDF) | Page-based + 50 token overlap | Handles cross-page paragraphs |
| file (Word) | Heading/paragraph split | Cleaner structure than PDF |
| text_snippet | No splitting | Manually entered, usually short |

## 6. File Structure

```
src/lib/rag/
  embeddings.ts         — OpenAI embedding wrapper + hash + token estimation
  ingest-products.ts    — Products → chunks → embeddings → DB
  personas.ts           — Persona (Dim 1) + User Profile (Dim 2) definitions, CRUD

src/app/api/
  ask/route.ts          — GET (personas + profiles) + POST (RAG query with 3 dimensions)
  documents/route.ts    — GET/POST/DELETE document management + trigger ingestion
  personas/route.ts     — GET/POST/DELETE persona management
  chat-sessions/route.ts — GET/POST/DELETE conversation persistence

src/app/(main)/
  ask/page.tsx                  — Ask SpecHub chat page (max-w-[1400px])
  knowledge/page.tsx            — Knowledge Base management (max-w-[1100px])
  settings/personas/page.tsx    — Persona prompt management (max-w-[1100px])

src/components/
  ask/ask-chat.tsx              — Chat UI + sidebar + persona + profile + model selector
  knowledge/knowledge-base.tsx  — Knowledge index dashboard + per-source management
  settings/personas-editor.tsx  — Persona CRUD editor

supabase/migrations/
  00009_add_rag_documents.sql   — pgvector + documents table + match_documents
  00010_add_chat_sessions.sql   — chat_sessions table for conversation persistence
```

## 7. Setup & Usage

### First-time Setup
1. **API Keys**: OpenAI key required (for embedding). At least one LLM key (Claude/GPT/Gemini) for answers. Set at `/settings/api-keys`.
2. **Migration**: `00009` (documents) and `00010` (chat_sessions) — already applied.
3. **Index**: Go to `/knowledge` → click **Index** on the Product Specs card → wait ~10-20s for 66 products.

### Daily Usage
1. Click **Ask** in navbar
2. **回答角度** — Select persona (Product Specialist / Sales / Support / PM)
3. **對話對象** — Select user profile (一般同事 / 新進同仁 / 業務 / Channel Sales / PM / 客戶)
4. Select AI model (Gemini / GPT / Claude → pick specific model from dropdown)
5. Type question or click example
6. Follow up with additional questions (system remembers context)
7. Past conversations auto-save and appear in the sidebar (hamburger icon)

### Knowledge Base Management
- Go to `/knowledge` to see all indexed content
- Summary cards: Sources, Chunks, Tokens, Source Types
- Per source type: Details table, Re-index, Force Re-index, Delete
- Last indexed timestamp shown on each card

### Re-indexing
After Google Sheets sync updates product data, go to `/knowledge` and click **Re-index** on Product Specs. Content hash ensures only changed chunks are re-embedded.

## 8. API Reference

### POST /api/ask
```json
{
  "question": "哪些 AP 支援 WiFi 7？",
  "persona": "sales",
  "profile": "channel-sales",
  "provider": "gemini-2.5-flash",
  "history": [{"role":"user","content":"..."},{"role":"assistant","content":"..."}],
  "source_type": "product_spec",
  "product_line": "Cloud AP"
}
```

| Parameter | Required | Description |
|---|---|---|
| `question` | Yes | The question to ask |
| `persona` | No | Dimension 1: answering angle (default: `default`) |
| `profile` | No | Dimension 2: who is asking (default: `default`) |
| `provider` | No | AI model ID (default: `gemini-2.5-flash`) |
| `history` | No | Previous messages for conversation context |
| `source_type` | No | Filter search to specific source type |
| `product_line` | No | Filter search to specific product line |

Response includes `answer`, `sources[]`, `follow_ups[]`, `persona`, `profile`, `provider`.

**Provider values**: `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gpt-4o`, `gpt-4o-mini`, `gpt-4.1-nano`, `claude-opus`, `claude-sonnet`, `claude-haiku`

**Profile values**: `default`, `new-hire`, `sales-rep`, `channel-sales`, `pm`, `customer`

### GET /api/ask
Returns list of available personas and user profiles.

### /api/documents (GET/POST/DELETE)
- GET: index stats (source count, chunk count, last updated)
- POST: `{ "action": "ingest", "source_type": "product_spec", "force": false }`
- DELETE: `{ "source_type": "product_spec", "source_id": "ECC100" }`

### /api/chat-sessions (GET/POST/DELETE)
- GET: list sessions or get specific session `?id=xxx`
- POST: create/update session `{ "id?", "title?", "messages?", "persona?", "provider?" }`
- DELETE: `{ "id": "xxx" }`

### /api/personas (GET/POST/DELETE)
CRUD for persona management.

## 9. Three-Dimension Prompt Architecture

The system uses a 3-layer prompt assembly that determines how AI responds. Each dimension is independent and combinable — creating a matrix of response styles.

```
Prompt Assembly:
  Layer 1: Persona        (回答角度 — what angle to answer from)
  Layer 2: User Profile   (對話對象 — who is asking)
  Layer 3: Output Format  (產出格式 — what to generate)  [Future]
  Layer 4: RAG Context    (retrieved product data)
  Layer 5: User Question  (the actual question)
```

### Dimension 1: 回答角度 (Persona) — Done

Controls **what content to emphasize and how to structure the answer**, not just tone.

| Persona | Emphasizes | Example difference for "ECC100 PoE?" |
|---|---|---|
| **Product Specialist** | Precise specs, related models | 「802.3af，最大 15.4W」 |
| **Sales Assistant** | Customer value, pairings | 「支援標準 PoE，一般企業 Switch 就能供電」 |
| **Technical Support** | Practical checks, troubleshooting | 「802.3af（15.4W）。確認 Switch 有開 PoE」 |
| **Product Manager** | Cross-model patterns, gaps | 「802.3af。ECC500 系列用 802.3at，這是分水嶺」 |

- 4 built-in personas + custom via `/settings/personas`
- Stored in `app_settings` as `persona_{id}`
- Each includes clarification rules (ask before guessing) and honesty rules (never fabricate)

### Dimension 2: 對話對象 (User Profile) — Done

Controls **depth of explanation and terminology** based on who is asking.

| Profile | Behavior adjustment |
|---|---|
| **一般同事** (default) | No adjustment — baseline response |
| **新進同仁** | Explain terms, add product line context, patient with basics |
| **業務人員** | Practical answers they can use with customers, suggest pairings |
| **Channel Sales** | Market positioning, sell-through strategy, competitive advantages |
| **產品經理** | Full technical depth, tables, feature gap analysis |
| **終端客戶** | Simplest language, no jargon, focus on benefits not specs |

- Default "一般同事" adds no extra prompt (zero friction)
- Profile prompt appended to persona prompt as a separate section
- Saved per session — no need to re-select within a conversation

### Dimension 3: 產出格式 (Output Format) — Future

Will control **what format of content to generate**, beyond Q&A.

| Template | Use case |
|---|---|
| Q&A (current) | Ask questions, get answers |
| 業務簡報 | Generate pitch deck outline for specific market + products |
| 產品比較表 | Structured comparison sheet |
| Email 草稿 | Product recommendation email to customer |
| 提案文件 | Proposal document with pain points + solution |

### Dimension Multiplication

The three dimensions multiply to create highly targeted responses:

```
Example: Channel Sales wants a pitch for education market

  Dimension 1: Sales Assistant (emphasize value, suggest pairings)
  Dimension 2: Channel Sales (market positioning, sell-through)
  Dimension 3: 業務簡報 (structured pitch format)  [Future]
  
  + RAG: ECW536, ECW526, ECS5512FP specs
  + Question: "幫我準備教育市場的推薦方案"

  → AI generates a structured pitch with market pain points,
    product recommendations with reasons, and competitive positioning
```

### Custom Personas
- Manage at `/settings/personas`
- Edit built-in prompts or create new ones (Reset to restore defaults)
- Stored in `app_settings` table as `persona_{id}`

### External API Integration

The `/api/ask` endpoint is a standalone REST API that external systems can call directly:

```
# Internal: 業務團隊前端
POST /api/ask { "persona": "sales", "profile": "sales-rep", ... }

# Internal: 客服系統 chatbot
POST /api/ask { "persona": "support", "profile": "customer", ... }

# External: 合作夥伴入口
POST /api/ask { "persona": "partner", "profile": "channel-sales", ... }
```

**Future: API Key access control** (after Supabase Auth):
- Each partner/department gets a unique API key
- Keys can restrict `source_type` scope (e.g., partners can only search `product_spec`, not `google_doc`)
- Usage tracking per key (call count, token consumption)
- Rate limiting per key tier

## 10. Conversation History & Persistence

### How it works
1. Frontend sends last 20 messages as `history[]` with each API call
2. Backend enriches the embedding query with history context — so "這幾台" resolves to models from the previous answer
3. Previous conversation included in LLM prompt as context
4. If vector search finds nothing but history exists, LLM answers from conversation context
5. **Auto-save**: conversations saved to `chat_sessions` table after each exchange (1s debounce)
6. **Sidebar**: hamburger icon opens history panel — click to resume, delete, or start new

### Session Management
- Title auto-generated from first user message
- Persona and provider saved per session (restored on resume)
- `user_id` defaults to `anonymous` — ready for Supabase Auth (add WHERE clause later)
- Sessions listed by most recent, showing message count and relative time

## 11. Image Handling Strategy (Future)

For sources with images (Gitbook, Google Docs, PDF, web):

1. **Image Description**: Claude Vision API generates text description of each image
2. **Image-Context Binding**: Description text embedded inline in the chunk content as `[Image: ...]`
3. **Image Storage**: Original images stored in Supabase Storage; URL reference in `metadata.images[]`
4. **Frontend Rendering**: When a chunk with images is returned, the frontend can display the image alongside the text

Not needed for `product_spec` (current). Implement when adding Gitbook/Google Docs/PDF sources.

## 12. Intent Detection (Future)

### When is it needed?
Not now (105 chunks, single source_type). Needed when documents grow to 1000+ chunks across multiple source types.

### What it does
Classifies the user's question intent before searching, to pick the right source types and search strategy.

| Intent | Example | Search Strategy |
|---|---|---|
| Spec query | "ECC100 解析度多少？" | product_spec only |
| Product comparison | "ECC100 vs ECC500" | product_spec, top_k: 12 |
| Installation/setup | "怎麼設定 cloud AP？" | gitbook + text_snippet |
| Troubleshooting | "PoE 不供電怎麼辦？" | gitbook + text_snippet |
| Recommendation | "適合倉庫的 AP？" | product_spec + text_snippet |
| Policy/process | "RMA 流程？" | google_doc + text_snippet |

### Implementation approaches (simple → complex)
1. **Persona + source_types binding** — each persona limits search scope (already supported in schema)
2. **Keyword rules** — question contains "怎麼裝/設定" → prioritize gitbook (500+ chunks)
3. **LLM Router** — cheap LLM classifies intent first, then routes (1000+ chunks)
4. **Multi-query** — break complex questions into sub-queries (advanced)

## 13. Important Notes

| Item | Detail |
|---|---|
| **OpenAI Key is required** | For embedding, even if using Claude/Gemini for answers |
| **Re-index is manual** | After Sync, go to /knowledge and click Re-index |
| **Content hash** | Prevents unnecessary API calls on re-index |
| **IVFFlat lists=10** | Suitable for < 1000 documents. Increase if growing beyond |
| **Similarity threshold 0.3** | Adjust to 0.4-0.5 if too many irrelevant results |
| **No Auth** | /api/ask is currently unprotected. Add Supabase Auth before wider rollout |
| **pgvector is free** | Included in all Supabase plans including Free |
| **Persona prompt length** | Keep < 500 tokens to leave room for context |
| **Markdown rendering** | AI responses render as Markdown (tables, lists, bold, code) via react-markdown + remark-gfm |
| **Chat auto-save** | Conversations persist in DB, survive page refresh |
| **Model selection** | Users pick provider → specific model from dropdown with tier badges |

## 14. Roadmap

| Phase | Item | Complexity | Status |
|---|---|---|---|
| 1 | product_spec + Ask UI + Persona (Dim 1) | Low | Done |
| 2 | Conversation history + DB persistence | Low | Done |
| 3 | Multi-model selector (3 tiers per provider) | Low | Done |
| 4 | Knowledge Base management page | Low | Done |
| 5 | Markdown rendering + copy button + follow-up questions | Low | Done |
| 6 | Clarification + honesty prompt rules | Low | Done |
| 7 | User Profile (Dim 2: 對話對象) | Low | Done |
| 8 | text_snippet CRUD | Low | Next |
| 9 | Auto re-index after Sync | Low | Planned |
| 10 | Gitbook ingestion | Medium | Planned |
| 11 | Google Docs ingestion | Medium | Planned |
| 12 | Streaming response (SSE) | Medium | Planned |
| 13 | Output Templates (Dim 3: 產出格式) | Medium | Planned |
| 14 | Image handling (Claude Vision) | Medium | Planned |
| 15 | Intent detection / query routing | Medium | Planned |
| 16 | Web link ingestion | Medium-High | Planned |
| 17 | Word/PDF upload + ingestion | High | Planned |
| 18 | Supabase Auth + API keys + usage tracking | Medium | Planned |
| 19 | External partner API access | Medium | Planned |

### Other improvements
- Hybrid search (vector + tsvector keyword match)
- Persona + source_type binding (limit search scope per persona)
- Answer quality feedback (thumbs up/down)
- Multi-language embeddings (embed translated content too)
- Query caching for common questions
- Conversation export (share/download chat history)
- Content generation export (PPTX, PDF, Word) for Dimension 3

## 15. Page Layout

| Page | Max Width | Purpose |
|---|---|---|
| Dashboard, Compare, Translations, Typography, Ask | `1400px` | Wide — tables, split layouts, chat |
| All other pages (Knowledge, Settings, Product, etc.) | `1100px` | Standard — forms, cards, lists |
