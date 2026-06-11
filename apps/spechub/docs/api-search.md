# EnGenius Product SpecHub — RAG Search API

> 給其他部門 / 應用串接的對外文件。
> 最後更新：2026-06-09 · 版本：v1

這支 API 讓你的應用查詢 EnGenius Product SpecHub 的知識庫(產品規格、技術文件、Help Center、WiFi 法規、官方網頁…),取得**最相關的內容片段**,再餵進你自己的 LLM / Agent 生成回答。

也就是說 —— **我們負責「找到對的知識」,生成回答交給你**。這是標準的 RAG(Retrieval-Augmented Generation)檢索層。

---

## 1. Base URL

```
https://ds-generator-eg.vercel.app
```

目前只有一個端點:`POST /api/v1/search`。

---

## 2. 認證

每個部門 / 應用會拿到一把 API key(格式 `sk_live_…`),由 SpecHub 管理員在後台核發。

每個請求都要帶:

```
Authorization: Bearer sk_live_xxxxxxxxxxxxxxxxxxxx
```

**重要安全規則:**

- **只在後端使用,不要放進前端 / 瀏覽器 / App 客戶端 / Git。** key 一旦外洩等於把知識庫對外開放。
- 若你的應用是純前端(SPA / 手機 App),請由你自己的後端代理這個請求,key 留在後端。
- key 可被管理員**即時停用 / 輪替**。如懷疑外洩,立刻通知 SpecHub 管理員換發。

---

## 3. 端點:`POST /api/v1/search`

### Request

Header:

| Header | 值 |
|---|---|
| `Authorization` | `Bearer <你的 key>`(必填) |
| `Content-Type` | `application/json` |

Body(JSON):

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `query` | string | ✅ | 使用者的問題 / 查詢字串。支援中英日(跨語言)。最長 2000 字。 |
| `top_k` | number | ✕ | 回傳幾筆片段。1–20,預設 **8**。 |
| `source_types` | string[] | ✕ | 只查這些來源類型(見下)。**只能在你 key 允許的範圍內縮小**。 |
| `taxonomy` | object | ✕ | 進一步限定 Solution / 產品線 / 型號(見下)。一樣只能縮小。 |

**`source_types` 可用值:**

| 值 | 內容 |
|---|---|
| `product_spec` | 產品規格、overview、features |
| `gitbook` | GitBook 技術文件 |
| `helpcenter` | Help Center 文章(最佳實踐、功能說明) |
| `google_doc` | Google Docs(訊息指南、產品簡報) |
| `wifi_regulation` | 各國 WiFi 法規 |
| `web` | 已索引的網頁 |

**`taxonomy` 物件:**

```json
{
  "solution": "cloud",                 // solution slug;省略 = 不限
  "product_lines": ["Cloud AP"],       // 產品線名稱;省略 = 整個 solution
  "models": ["ECW536"]                 // 型號;省略 = 不限型號
}
```

### Response（200）

```json
{
  "ok": true,
  "query": "Which access points support WiFi 7?",
  "count": 3,
  "scope": {
    "client": "Sales Portal",
    "taxonomy": { "solution": null, "product_lines": [], "models": [] },
    "source_types": null
  },
  "results": [
    {
      "content": "ECW536 — Cloud7 4x4 … (相關片段內文)",
      "title": "ECW536 — Cloud7 4x4",
      "source_type": "product_spec",
      "source_id": "ECW536",
      "source_url": null,
      "score": 0.6421,
      "taxonomy": { "solution": "cloud", "product_lines": ["Cloud AP"], "models": ["ECW536"] }
    }
  ]
}
```

`results[]` 欄位:

| 欄位 | 說明 |
|---|---|
| `content` | 片段內文(已清洗,可直接餵 LLM) |
| `title` | 該片段標題 |
| `source_type` | 來源類型(同上表) |
| `source_id` | 來源識別碼(型號、文章 slug、網址路徑…) |
| `source_url` | 原始連結(若有;product_spec 為 `null`)— 可拿來在回答裡標來源 |
| `score` | 相關度分數(越高越相關) |
| `taxonomy` | 該片段所屬的 Solution / 產品線 / 型號 |

`scope` 會回傳這次**實際生效的範圍**(你的 key 範圍 ∩ 你的請求),方便除錯。

---

## 4. Scope(範圍限制)

你的 key 由管理員綁定一個**範圍上限**:Solution / 產品線 / 型號 / 來源類型。

- 你可以在請求裡用 `source_types` / `taxonomy` **再縮小**,但**永遠無法超出 key 的範圍**。
- 若你請求的範圍落在 key 允許之外,系統會自動忽略該請求條件、退回 key 的範圍(不會回傳越權內容)。
- 想擴大範圍,請聯絡管理員調整你的 key。

---

## 5. 速率限制(Rate Limit)

每把 key 有「每分鐘請求數」上限(預設 60/min,可由管理員調整)。

- 超過會回 **429 Too Many Requests**,稍候再試即可(固定 60 秒視窗)。
- 請避免在前端對每次按鍵都打 API;在使用者送出查詢時才呼叫,並可在你端做快取。

---

## 6. 錯誤碼

| HTTP | `error` 範例 | 原因 / 處理 |
|---|---|---|
| `400` | `Missing 'query'` / `'query' too long` / `Invalid JSON body` | 請求格式錯誤,修正 body |
| `401` | `Missing 'Authorization: Bearer <key>' header` / `Invalid API key` | 沒帶 key 或 key 錯誤 |
| `403` | `API key disabled` | key 已被停用,聯絡管理員 |
| `429` | `Rate limit exceeded — try again shortly` | 超過速率上限,稍候重試 |
| `500` | `Search failed: …` | 伺服器端錯誤,可重試;持續發生請回報 |

所有錯誤都回 JSON:`{ "ok": false, "error": "…" }`。

---

## 7. 範例

### cURL

```bash
curl -X POST https://ds-generator-eg.vercel.app/api/v1/search \
  -H "Authorization: Bearer sk_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "哪些 AP 支援 WiFi 7?",
    "top_k": 8,
    "source_types": ["product_spec", "helpcenter"]
  }'
```

### JavaScript / Node(後端)

```js
const res = await fetch("https://ds-generator-eg.vercel.app/api/v1/search", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.SPECHUB_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: "ECW536 和 ECW526 差在哪?", top_k: 6 }),
});
const data = await res.json();
if (!data.ok) throw new Error(data.error);
const context = data.results.map((r) => r.content).join("\n\n---\n\n");
// 把 context 餵進你自己的 LLM(見第 8 節)
```

### Python(後端)

```python
import os, requests

resp = requests.post(
    "https://ds-generator-eg.vercel.app/api/v1/search",
    headers={"Authorization": f"Bearer {os.environ['SPECHUB_API_KEY']}"},
    json={"query": "推薦適合飯店的網路方案", "top_k": 8},
    timeout=30,
)
data = resp.json()
if not data["ok"]:
    raise RuntimeError(data["error"])
context = "\n\n---\n\n".join(r["content"] for r in data["results"])
```

---

## 8. 如何把結果變成回答(RAG 模式)

把 `results[].content` 串成 context,連同使用者問題餵給你的 LLM:

```
你是 EnGenius 產品助理。只根據以下「參考資料」回答,不要編造。
若資料不足就說不知道。回答用使用者提問的語言。

參考資料:
{context}    ← 把 results[].content 串起來放這

問題:{使用者的問題}
```

建議:用 `source_url` / `title` 在回答裡標註來源;`score` 偏低(例如 < 0.3)的片段可考慮捨棄。

---

## 9. 注意事項與最佳實務

- **Server-to-server only**:不開放 CORS,請從你的後端呼叫,key 不落地到瀏覽器。
- **語言**:`query` 可用中 / 英 / 日,系統已對跨語言檢索做補強(型號、國家名等)。
- **不要把整段對話塞進 `query`**:只放當前要檢索的問題即可(太長會被截到 2000 字)。
- **版本化**:路徑帶 `/v1`。未來若有不相容變更會出 `/v2`,`/v1` 會保留一段過渡期。
- **內容更新**:知識庫每天 / 每週自動更新,你不需要做任何事;查到的永遠是最新索引。

---

## 10. 取得 / 管理 key

由 SpecHub 管理員在 **Settings → API Access (Departments)** 核發,並設定你的範圍與速率上限。需要新 key、調整範圍、或懷疑外洩需輪替,請聯絡管理員。
