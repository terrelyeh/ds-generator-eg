# Ask Workspaces — Phase 2 計畫書（部門私有知識，自助索引）

> 狀態：**規劃中**（Phase 1 已上線）。本文是給未來 session / RD 的實作藍圖。
> 建立：2026-06-09

## 一句話目標

讓每個 Ask workspace（`/ask/<slug>`）除了共用的 EnGenius 知識庫之外，**還能擁有自己的私有文件**，由**部門自己上傳並自動索引**（你/admin 不必當索引苦工），且各 workspace 的私有內容**彼此隔離**。

## Phase 1 已具備（本計畫的地基）

- `ask_workspaces` 表 + `/ask/<slug>` 入口 + passcode cookie。
- `/api/ask` 的 `workspace` 模式：scope 檢索、BYOK/共用 key、配額。
- 共用檢索核心 `lib/rag/retrieve.ts`、6 條 ingestion pipeline（`ingest-web/google_doc/...`）、AES 加密、taxonomy scope。

Phase 2 = 在這之上加「**per-workspace 私有文件**」這一層。

---

## 核心設計

### 1. 資料模型：`documents` 加 `workspace_id`

- `documents.workspace_id uuid null`（FK → `ask_workspaces.id`，`on delete cascade`）。
  - `null` = 共用全域知識庫（現狀，所有 workspace + 桌機 Ask + Search API 都看得到）。
  - 有值 = **私有**於該 workspace，只有該 workspace 的查詢看得到。
- 索引：`create index on documents (workspace_id)`。
- `onConflict` 升級：現在是 `(source_type, source_id, chunk_index)`；私有文件可能跨 workspace 撞 source_id（兩個部門都傳同一個網址）。改成 **`(workspace_id, source_type, source_id, chunk_index)`**（需處理 null —— Postgres unique 對 null 視為相異，建議用 partial unique 或把 workspace_id 預設成一個 sentinel；實作時定案）。

### 2. 檢索：workspace 查詢 = 共用 ∪ 私有

`retrieveDocuments` 在 workspace 模式下，候選集 = 「共用(`workspace_id is null`) 且符合 scope」**∪**「該 workspace 的私有(`workspace_id = :wsId`)」。

- 作法 A（推薦）：擴充 `match_documents` RPC 加一個 `filter_workspace_id` 參數，SQL 內 `where workspace_id is null or workspace_id = filter_workspace_id`。
- 作法 B：app-level —— 跑兩次查詢合併。較簡單但兩次 embedding 距離排序要自己 merge。
- **安全關鍵**：非該 workspace 的查詢（其他 workspace、桌機 Ask、`/api/v1/search`）**永遠只看 `workspace_id is null`**。預設就是這樣（它們不傳 wsId），但要在 retrieve 加防呆：只有 workspace 模式才放行私有。

### 3. 自助索引 UI（重點：別讓 admin 當瓶頸）

每個 workspace 一個**自己的知識管理區**（scoped 版的 `/knowledge`）：

- 部門自己：貼網址（web）、貼文字（text_snippet）、接 Google Doc、**上傳檔案（PDF/Word）** → 按一下 → 系統自動跑 ingestion，chunk 打上 `workspace_id`。
- 列表 / 刪除 / 重新索引，全部部門自助。embedding 用**我們的 key**（便宜），就算 workspace 是 BYOK 也一樣。

**誰能管理？**（Phase 2 最大的設計決策 —— 需先拍板）
Phase 1 的 workspace 只有 passcode、沒有「使用者身分」。私有文件的「管理」需要比「聊天 passcode」更高的權限。三個選項：
- (a) **第二組管理 passcode**：workspace 多一個 `manage_passcode_hash`，進管理頁要這組。最快、不需帳號系統。
- (b) **workspace-scoped 帳號角色**：部門窗口用 SpecHub Google 帳號登入，給一個「只能管自己 workspace」的角色。最正規但要動 RBAC + email_whitelist 綁 workspace。
- (c) **admin 代管**：退回「你來上傳」—— 不符合自助目標，僅作為 fallback。

> 建議 Phase 2 先用 (a) 第二組管理 passcode，最快讓部門自助；之後若要正規化再上 (b)。

### 4. 檔案上傳 + 解析（`file` source type，尚未做）

- 上傳端點：存到 Supabase Storage（per-workspace bucket/prefix）。
- 解析：PDF → `pdf-parse` 或 `unpdf`；Word(.docx) → `mammoth`。抽純文字 → 走現有 chunk + embed。
- `ingest-file.ts`：模仿 `ingest-web.ts`（萃取 → chunk → content_hash 去重 → embed → upsert，帶 `workspace_id`）。
- 限制：檔案大小、頁數、每 workspace 文件數/儲存量上限（防爆）。

### 5. 隔離與安全

- 私有 chunk 絕不外洩到：其他 workspace、桌機 Ask、`/api/v1/search`、weekly cron 的重算結果。
- `documents` 已是 RLS-on service-role-only；隔離靠**查詢層**強制（retrieve 的 workspace 過濾）。要寫測試：A workspace 查不到 B 的私有文件。
- 刪 workspace → cascade 刪它的私有 chunk。

---

## 工時 / 範圍估（粗估）

| 區塊 | 內容 | 規模 |
|---|---|---|
| 資料模型 | `documents.workspace_id` migration + onConflict 調整 | 小 |
| 檢索 | `match_documents` 加 workspace 參數 + retrieve 防呆 | 中 |
| 自助管理權限 | 第二組管理 passcode（選項 a） | 小–中 |
| 自助知識 UI | scoped /knowledge（web/text/google_doc + 列表/刪除/重索引） | 中–大 |
| 檔案上傳 | Storage 上傳 + `ingest-file.ts`（PDF/Word 解析） | 中 |
| 隔離測試 | 跨 workspace 不外洩的自動化驗證 | 小 |

整體：比 Phase 1 略大，主要在「自助知識 UI + 檔案解析」。可再切小步：先做 web/text/google_doc 自助（無檔案上傳），檔案上傳當 Phase 2b。

---

## 開工前要拍板的決策

1. **管理權限**用哪個方案？（建議 a：第二組管理 passcode）
2. **檔案上傳**要不要進 Phase 2 第一波，還是延到 2b？
3. **每 workspace 配額**：文件數 / 儲存量 / 每月可索引 token 上限？
4. 私有文件要不要也吃 **BYOK embedding**，還是一律我們的 key？（建議一律我們的，便宜且必須對齊索引模型）

---

## 不在 Phase 2 範圍

- 完全獨立的知識庫（每 workspace 一套向量空間）—— 沒必要，`workspace_id` 過濾就夠。
- 對外（非內部部門）開放 —— 仍是內部工具。
- 跨 workspace 分享私有文件 —— 真有需求再說。
