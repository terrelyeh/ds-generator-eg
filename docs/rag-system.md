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
- Multilingual: auto-detects question language and responds accordingly

### Key Terms
| Term | Description |
|---|---|
| **RAG** | Retrieval-Augmented Generation — search first, then LLM answers based on retrieved context |
| **Embedding** | Text → 1536-dim vector. Semantically similar text = close vectors |
| **pgvector** | PostgreSQL vector search extension, built into Supabase (all plans including free) |
| **Chunk** | A document split into smaller pieces, each independently embedded and searchable |

## 2. Architecture

### Query Workflow
```
User question → Embed (OpenAI) → Vector search (pgvector, top 8)
→ Build context → LLM answer (Claude/GPT-4o/Gemini) → Response + sources
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

### Indexes
- `documents_embedding_idx` — IVFFlat cosine for vector search
- `documents_source_type_idx` — filter by source type
- `documents_source_chunk_unique` — prevents duplicate chunks on re-embed

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
- **Models**: Claude Sonnet (default), GPT-4o, Gemini 2.5 Flash
- **System prompt**: loaded from Persona (see Section 9)
- **Anti-hallucination**: prompt instructs "answer based ONLY on provided context"
- **Language**: auto-detect from question

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
  personas.ts           — Persona definitions, CRUD, built-in defaults

src/app/api/
  ask/route.ts          — GET (list personas) + POST (RAG query)
  documents/route.ts    — GET/POST/DELETE document management + trigger ingestion
  personas/route.ts     — GET/POST/DELETE persona management

src/app/(main)/
  ask/page.tsx                  — Ask SpecHub page
  settings/personas/page.tsx    — Persona management settings

src/components/
  ask/ask-chat.tsx              — Chat UI + persona selector
  settings/personas-editor.tsx  — Persona CRUD editor

supabase/migrations/
  00009_add_rag_documents.sql   — pgvector + documents table + match_documents
```

## 7. Setup & Usage

### First-time Setup
1. **API Keys**: OpenAI key required (for embedding). At least one LLM key (Claude/GPT-4o/Gemini) for answers. Set at `/settings/api-keys`.
2. **Migration**: `00009_add_rag_documents.sql` — already applied via Supabase MCP.
3. **Index**: Go to `/ask` → click **Index Products** → wait ~10-20s for 66 products.

### Daily Usage
1. Click **Ask** in navbar
2. Select persona (Product Specialist / Sales / Support / PM)
3. Type question or click example
4. Select LLM provider (Claude / GPT-4o / Gemini)

### Re-indexing
After Google Sheets sync updates product data, click **Re-index** on the `/ask` page. Content hash ensures only changed chunks are re-embedded.

## 8. API Reference

### POST /api/ask
```json
{
  "question": "哪些 AP 支援 WiFi 7？",
  "persona": "sales",
  "provider": "claude",
  "source_type": "product_spec",
  "product_line": "Cloud AP"
}
```

Response includes `answer`, `sources[]` (with similarity scores), `persona`, `provider`.

### GET /api/ask
Returns list of available personas.

### POST /api/documents
```json
{ "action": "ingest", "source_type": "product_spec", "force": false }
```

### GET /api/documents?source_type=product_spec
Returns index stats (source count, chunk count, last updated).

### /api/personas (GET/POST/DELETE)
CRUD for persona management.

## 9. Persona System

### Built-in Personas (4)

| Persona | Target | Style |
|---|---|---|
| **Product Specialist** (default) | General / MKT | Precise specs, comparisons, multilingual |
| **Sales Assistant** | Sales team | Benefits, selling points, customer language |
| **Technical Support** | Support / Help desk | Simple explanations, troubleshooting steps |
| **Product Manager** | Internal PM | Detailed comparison tables, feature gap analysis |

### Custom Personas
- Manage at `/settings/personas`
- Edit built-in prompts or create new ones
- Stored in `app_settings` table as `persona_{id}`

### API Integration
Different departments can build their own frontends calling `/api/ask` with different `persona` values.

## 10. Image Handling Strategy (Future)

For sources with images (Gitbook, Google Docs, PDF, web):

1. **Image Description**: Claude Vision API generates text description of each image
2. **Image-Context Binding**: Description text embedded inline in the chunk content as `[Image: ...]`
3. **Image Storage**: Original images stored in Supabase Storage; URL reference in `metadata.images[]`
4. **Frontend Rendering**: When a chunk with images is returned, the frontend can display the image alongside the text

Not needed for `product_spec` (current). Implement when adding Gitbook/Google Docs/PDF sources.

## 11. Important Notes

- **OpenAI Key is required** for embedding, even if using Claude for answers
- **Re-index is manual** — after Sync, go to /ask and click Re-index
- **Content hash** prevents unnecessary API calls on re-index
- **IVFFlat lists=10** — suitable for < 1000 documents. Increase if growing beyond that
- **Similarity threshold 0.3** — adjust to 0.4-0.5 if too many irrelevant results
- **No Auth** — /api/ask is currently unprotected. Add Supabase Auth before wider rollout
- **pgvector is free** — included in all Supabase plans including Free

## 12. Roadmap

| Phase | Item | Complexity |
|---|---|---|
| 1 (Done) | product_spec + Ask UI + Persona | Low |
| 2 | text_snippet CRUD | Low |
| 3 | Auto re-index after Sync | Low |
| 4 | Gitbook ingestion | Medium |
| 5 | Google Docs ingestion | Medium |
| 6 | Streaming + conversation history | Medium |
| 7 | Image handling (Claude Vision) | Medium |
| 8 | Web link ingestion | Medium-High |
| 9 | Word/PDF upload + ingestion | High |
| 10 | Supabase Auth + usage tracking | Medium |

### Other improvements
- Hybrid search (vector + tsvector keyword match)
- Document management UI
- Persona + source_type binding
- Answer quality feedback (thumbs up/down)
- Multi-language embeddings
- Query caching for common questions
