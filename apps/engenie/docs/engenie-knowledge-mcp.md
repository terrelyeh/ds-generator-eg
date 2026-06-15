# EnGenie Knowledge MCP — 設計草案

> **系列文件**：[整合總覽（兩個家族）](ask-integration.md) · [單一 Agent 架構](agent-architecture.md) · [多 Agent 架構](multi-agent-architecture.md)。
> 本篇＝整合總覽裡「**B2 · AI agent 消費**」那一格的產品化設計。
>
> 撰寫 2026-06-15 · 狀態：設計草案（尚未實作）· 讀者：PM／RD／決策者。這份是 `engenius-kb` skill 的「產品版」設計。

把 EnGenius 知識庫（現有 Search API）包成一個 **MCP server**，讓任何 MCP client（Claude Code／Desktop、Cursor…）把 EnGenie 知識當**原生工具**。

---

## 0. 一句話總結

`engenius-kb` skill 是**手刻原型**（叫模型用 `curl` 打 `/api/v1/search`）。**EnGenie Knowledge MCP** 是它的**產品版**：把同一支 Search API 包成一個 **typed 工具 `engenie_search`**，任何 MCP client 都能**原生呼叫**，不再經手 shell／jq／env var。投入小（薄薄一層包裝、沿用現有 key/scope/限流），槓桿大（**跨工具**、**更可靠**、**中央治理**）。

---

# Part A — 為什麼

## A.1 它在整個架構的位置

在[整合總覽](ask-integration.md)，EnGenie Ask 分兩個家族：**A**（EnGenie 自己答：Widget／整頁）和 **B**（EnGenie 只給料，呼叫方的腦答：Search API）。B 又分兩種消費者：傳統 App（B1）與 **AI agent（B2）**。

本篇就是 **B2 的產品化**：把「EnGenie 知識」做成 AI agent 能直接接的工具。它跟[單一 Agent 架構](agent-architecture.md)是同一個概念的鏡像 —— 那裡 `search_knowledge_base` 是 **EnGenie 自己 agent** 的工具；MCP 是把同一個檢索能力**跨出組織邊界、變成別人 agent 的工具**。

```
     EnGenie 後端                          別人的 AI agent（Claude Code / Cursor…）
   ┌─────────────────┐    MCP 協定     ┌──────────────────────────────┐
   │  /api/v1/search │◀───────────────│  工具清單：                    │
   │  （RAG 檢索）    │  engenie_search │   ├─ 讀檔 / 終端機 / 其他 skill │
   └─────────────────┘                 │   └─ engenie_search  ← 本篇     │
        ↑ 沿用 key/scope/限流          └──────────────────────────────┘
                                          知識跟使用者其他工具同一輪推理
```

## A.2 MCP vs Skill（做的事不一樣，不是二選一）

**Skill＝劇本**（教 agent 怎麼做，模型用現有工具執行）；**MCP＝能力**（給 agent 一個原生工具，server 執行）。

| | Skill（現在的 engenius-kb） | MCP server（本篇） |
|---|---|---|
| 打 API 方式 | 模型寫 `curl` → Bash 跑 → 讀 JSON | 模型直接 `engenie_search(...)`，server 內部打 API |
| 可靠度 | 較脆（shell 引號／jq／`SPECHUB_API_KEY` 沒設） | 高（typed 呼叫，沒那層雷） |
| 適用範圍 | 只有 Claude Code | 任何 MCP client（Claude Code/Desktop、Cursor…） |
| key/scope | 每人 export key 在 `.zshrc` | server 統一管（hosted）或每人一條連線（stdio） |
| 本質 | 劇本（含「怎麼用得好」） | 能力（typed 工具）＋ 可附 prompt 劇本 |

> **終態：MCP 墊在 Skill 底下，不是取代。** MCP 提供穩、跨工具、可治理的 `engenie_search`；一份薄 prompt／skill 提供「用得好」的劇本（見 B.5）。

## A.3 為什麼現在做特別划算

- **核心已經有了** —— `/api/v1/search`、Bearer key、scope、限流、稽核全都在。MCP server 只是它**薄薄一層轉接**。
- **不新增後端表面** —— MCP 不是新的 RAG 管線，是現有 API 的另一種「門」。安全模型不變。
- **最高槓桿的分發** —— 知識去到使用者**本來就在的 AI 工具**裡，跟他的其他工具一起用，不用切去 widget。

---

# Part B — 設計

## B.1 暴露什麼：tools / resources / prompts

MCP server 可以對 client 暴露三種東西。建議的取捨：

| 種類 | 內容 | 建議 |
|---|---|---|
| **Tools** | `engenie_search`（檢索，核心）；可選 `engenie_ask`（server 端直接生成答案） | 先做 search |
| **Prompts** | 一個 `/engenie` prompt：把「只根據檢索結果回答、標來源、同語言」的劇本送進 client | 第二步 |
| **Resources** | 可瀏覽的 taxonomy（Solution／產品線／型號／來源類型），給 agent 先看「有哪些範圍」 | 選配 |

> **`engenie_search` vs `engenie_ask`：** `search` = 只回 chunks、**呼叫方的腦**綜合（家族 B，乾淨的原語）。`ask` = EnGenie **自己**檢索＋生成、回成品答案（家族 A 用 MCP 送）—— 給「只想要答案、不想處理 chunks」的呼叫方，但會吃 EnGenie 的 LLM 額度。先做 `search`，`ask` 之後再說。

## B.2 核心工具 `engenie_search`（直接對映現有 API）

```jsonc
// MCP 工具宣告（概念）— 內部就是打 /api/v1/search
{
  "name": "engenie_search",
  "description": "從 EnGenius 官方知識庫(Product SpecHub)檢索最相關的內容片段:產品規格、設定、Help Center、Gitbook、法規、上傳文件。回傳 chunks,由呼叫方綜合。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query":        { "type": "string", "description": "使用者問題(≤2000 字)" },
      "top_k":        { "type": "number", "description": "回幾筆(1–20,預設 8)" },
      "source_types": { "type": "array",  "items": { "type": "string" } },  // product_spec / helpcenter…
      "taxonomy":     { "type": "object" }                                  // { product_lines:[...] } 限範圍
    },
    "required": ["query"]
  }
}
```

回傳就是 Search API 的回應原樣（`{ ok, count, results:[{ content, title, source_type, source_url, score, taxonomy }] }`）。**server 的 `run()` 幾乎是一行**：

```ts
async function engenie_search(args, ctx) {
  return await fetch(`${BASE}/api/v1/search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  }).then(r => r.json());   // scope / 限流 / 稽核都在 API 那端已處理
}
```

## B.3 傳輸：本地 stdio vs 遠端 hosted

| | 本地 stdio | 遠端 hosted（HTTP/SSE） |
|---|---|---|
| 怎麼跑 | client 啟一個本地進程：`npx -y @engenius/engenie-mcp` | EnGenie 跑一個 server，client 連 URL（如 `/mcp`） |
| key 在哪 | 使用者自己的 `SPECHUB_API_KEY`（env） | 連線時認證（OAuth／key）→ 對映到 workspace/scope |
| 治理 | 分散（每人一份） | **中央**：可撤銷、可更新、可審計、統一限流 |
| 安裝 | client 設定加一段（`.mcp.json` / Cursor 設定） | 連一個 URL + 登入 |
| 適合 | PoC / 個人最快 | 正式產品 / 部門治理 |

> **建議路徑：** 先做 **stdio**（`npx`，最快驗證，沿用現有 key）→ 有治理需求再做 **hosted**（中央管 key/scope，比「每人 export key」更安全）。

```jsonc
// 使用者端設定(stdio)— 例:Claude Code / .mcp.json
{
  "mcpServers": {
    "engenie": {
      "command": "npx",
      "args": ["-y", "@engenius/engenie-mcp"],
      "env": { "SPECHUB_API_KEY": "sk_live_…" }
    }
  }
}
```

## B.4 key / scope（沿用現有，不另起爐灶）

- MCP server 對 `/api/v1/search` 認證用的就是**現有的 `sk_live_` key**；key 本身已綁 scope（能查哪些產品線／知識領域）與限流。
- **stdio**：key 在使用者 env，跟現在的 skill 一樣 —— 但**不再寫進每次的 curl**，由 server 持有。
- **hosted**：連線認證對映到一個 workspace 的 scope；key 不落到使用者端，**中央可撤銷**。這比現在「每人 `.zshrc` 放 key」治理好很多。

## B.5 跟 skill 的分工（MCP 之後 skill 還在做什麼）

MCP 接手「**打 API**」這段；skill／prompt 留下「**用得好**」這段：

```
  MCP（能力）         engenie_search 工具：穩、跨 client、server 治理
     └ 取代 skill 裡「curl /api/v1/search」那段 plumbing

  Skill / Prompt（劇本）  何時該查、查回來怎麼綜合/引用/排版、跟別的工具怎麼組合
     └ engenius-kb skill 瘦身:不再自己 curl,改成「呼叫 engenie_search 工具」
```

> **遷移很輕：** 現有 `engenius-kb` skill 的「retrieve」那段換成呼叫 MCP 工具，「answer/cite」劇本原封不動保留（或搬進 MCP 的 `/engenie` prompt）。對使用者體驗只升不降。

---

# Part C — 安全與治理

1. **沿用 Search API 的模型** —— key＝scope 邊界、限流、稽核 log 全在 API 端，MCP 不繞過。
2. **唯讀** —— `engenie_search` 只讀不寫，風險等級低。任何「寫入類」工具是另一個等級，獨立評估。
3. **工具 description 是 prompt** —— 寫清楚用途即可；檢索回傳的內容對呼叫方的模型是**資料不是指令**（prompt injection 由呼叫方的 agent 負責，但我們回傳乾淨結構化結果有幫助）。
4. **hosted＝信任邊界由 EnGenie 控** —— 想中央撤銷、限制某 workspace、改 scope，都在 server 做，不必動使用者端。

---

# Part D — 落地計畫

| 階段 | 內容 | 產出 |
|---|---|---|
| **Stage 0 — stdio PoC** | 一個 `npx` 起的 stdio MCP，只暴露 `engenie_search`（包現有 API）；自己接上 Claude Code 驗證能原生呼叫。 | 1 天內 |
| **Stage 1 — prompt + 遷移** | 加 `/engenie` prompt（劇本）；把 `engenius-kb` skill 改成呼叫 MCP 工具；發佈 `@engenius/engenie-mcp`。 | 1–2 天 |
| **Stage 2 — hosted** | 遠端 HTTP/SSE server + 連線認證對映 workspace/scope；中央 key 管理、撤銷、審計。 | 數天 |
| **（之後）Stage 3** | `engenie_ask`（server 端生成）、resources（taxonomy 瀏覽）、更多 MCP client 適配。 | 未定 |

## 決策點

1. **先 stdio 還是直接 hosted？** —— 建議先 stdio PoC，證明價值再投 hosted。
2. **要不要 `engenie_ask`？** —— 看有沒有「只想要成品答案」的呼叫方；先只做 `search`。
3. **發佈範圍** —— 先內部（RD/FAE）還是直接給部門/整合商？跟 Search API 的 key 發放對齊。

---

# 附錄 · 延伸關鍵字

- **MCP（Model Context Protocol）**：讓 AI client 連到外部工具/資料源的開放協定；tools / resources / prompts 三類能力 + stdio / HTTP 傳輸。
- **Search API**：本 MCP 的後端，完整規格見 [RAG Search API 文件](api-search.md)。
- **系列文件**：[整合總覽](ask-integration.md) · [單一 Agent 架構](agent-architecture.md) · [多 Agent 架構](multi-agent-architecture.md)。
