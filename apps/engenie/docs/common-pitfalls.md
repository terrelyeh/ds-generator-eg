# Common Pitfalls — EnGenie

從 [CLAUDE.md](../CLAUDE.md) 搬出來（2026-09-13）。編號沿用 spechub、**不重排**——程式註解與 commit
裡的「pitfall #N」指的就是這裡的第 N 條。CLAUDE.md 只列最常踩的幾條的一句話版本。

54. **`useChatStream` POST body 一律 `...getParams()` 展開**，別寫死欄位清單 — 否則 workspace/userKey 等欄位被靜默丟掉，workspace 模式整個被繞過（看起來能用、送出才壞）。

55. **Postgres RPC 的 `bigint` 經 PostgREST 回來是字串** — `knowledge_sources()` 的 chunks/total_tokens 要 `Number(x) || 0` 再用。

56. **Gemini key 永遠放 header 不放 URL**；錯誤訊息回前端前先 redact。

57. **`knowledge-base.tsx` 是 orchestrator** — 對話框在 `knowledge/dialogs/`、共用邏輯在 `knowledge/shared.ts`；新增來源類型照這結構，別把 state 塞回 parent。

58. **Workspace token 撤銷機制** — `verifyWorkspaceToken()` 只驗簽章+到期（Edge 粗篩）；版本撤銷的權威檢查在 route handler（`workspaceAuthorized`）。改 token 格式/換 signing secret = 所有現存 token 失效（widget 自動重發、passcode 重輸一次）。

59. **RAG 檢索 embedding 只用「當前問題」，不要串對話歷史** — 串歷史會讓前一題主題污染這題的向量搜尋（換主題被當成「知識庫只有前一題的內容」）。歷史只進 `/api/ask` 的 LLM prompt；建議追問也要求 LLM 產生「自包問句」（`api/ask/route.ts` 的 follow-up 指示）。

60. **`product_spec` ingest：`content_hash` 只 gate「重新 embed」，metadata 一律刷新** — 內容沒變但 metadata（taxonomy）漂移時，`ingest-products.ts` 做 metadata-only update（不重 embed）。別把兩者重新耦合，否則新加的 metadata 欄位不會回填舊 chunk（症狀：taxonomy badge 時有時無）。

61. **Gemini Flash 一律關 reasoning** — flash/lite 的 thinking 發生在第一個 token 之前、且串流會丟棄 thought parts，等於純浪費 7–15s（實測）。
    **2026-08-07 起機制改了**：`thinkingBudget:0` → OpenRouter 的 `reasoning: { effort: "none" }`，
    而且不再寫在程式裡 —— 設在**模型目錄 `llm_models.reasoning_effort`**（`/settings/models` 可改）。
    **但 `none` 不是每個 flash 都吃** —— `google/gemini-3.5-flash` 會回
    `400 Reasoning is mandatory for this endpoint and cannot be disabled.`，
    `gemini-3.1-flash-lite` 則可以。**2026-08-08 實測**：3.5-flash 已改成 `low`。
    新增 flash 型號時**先打一發 OpenRouter 確認該型號吃不吃 `none`**，別直接照抄；
    **Pro 級刻意留空**（選 Pro 就是要深度推理）。

62. **`chat_sessions` 綁 `user_id`，所有查詢都要 `.eq("user_id", user.id)`** — 用 `requirePermission("ask.use")` 取得 user，create 寫真實 id、read/update/delete 全部過濾；update 找不到列回 404 不假裝成功。舊 `user_id='anonymous'` 列刻意孤立（不遷移），所以部署後每人的歷史列表從空開始。別用回 `gate()`（它不回 user）。

63. **Ask 熱路徑快取寫入端一定要 invalidate** — `getApiKey`（settings route 寫完呼叫 `invalidateApiKeyCache`）、personas（`savePersona`/`deletePersona` 內建 invalidate）。新增「會改 app_settings LLM key / persona」的路徑時記得一起清，否則最長 60s 看到舊值。embedding LRU 不用 invalidate（同 model+text 結果恆定）。

64. **`ingest-web` 有 SSRF 白名單（`isSafePublicUrl`）** — 擋 loopback/RFC1918/link-local/metadata IP + 十進位/十六進位 IP 變形 + `.local`/`.internal`。純 hostname 比對（DNS-rebinding 不在範圍，此功能 admin-gated）。被擋的 URL 進 `errors[]` 不中斷其他頁。

65. **passcode 端點（`ws-auth`/`demo-auth`）有 DB-backed 限流** — `passcodeAttemptAllowed(scope, request)` 走 RPC `auth_rate_check`（每 surface+IP 5 分鐘 10 次），放在任何 lookup/hash 比對**之前**（也消 slug 列舉 timing oracle）。fail-open。測試觸發後記得清 `auth_rate_limits` 對應列，免得誤擋真實出口 IP。

66. **模型清單一律來自目錄 `llm_models`，元件裡不准寫死** — 2026-08-08 修：Ask 有
    **四份**各自寫死的模型清單（`ask-chat`、`engenie-drawer`、`ask-workspaces-manager`、
    `settings/providers` 的 key 探測），全都還在用 slug 遷移前的短 id（`claude-opus`）。
    症狀騙人：下拉正常展開、正常打勾，但 `resolveModel()` 查無此 id → **每一次選擇都靜默
    落回 surface 預設**，選單等於裝飾品；後端 enable 9 個、前端只長出寫死的 6 個。
    前端一律用 `useAskModels()`（打 `/api/settings/models?surface=ask`），存進 DB 的是 slug。
    **推論**：改識別碼體系時要把所有消費端找齊再改，本機 build 全綠證明不了這件事。

67. **`/api/settings/models?surface=` 刻意免登入** — 它同時服務 passcode 門的
    `/demo`、`/ask/<slug>`、`/embed/<slug>`（那些帶 workspace cookie、不是 Supabase session）。
    只吐 enabled 模型的 slug/label/tier/default_for，就是選單本來就給那些人看的東西；
    **無 surface 參數的完整清單仍是 admin-only**。別順手把整條 route 收回 session 後面。

68. **上游 LLM 失敗要送 `type:"error"` 不要送 `type:"chunk"`** — 送成 chunk 會被前端當成
    答案文字接上去，整段 outage 讀起來像正常輸出（2026-08-08 就是這樣讓 Ask 壞了好幾天沒人發現：
    帳本 `llm_usage_events` 一筆 `surface='ask'` 都沒有 = 根本沒成功呼叫過）。
    **查 Ask 是否真的活著，看帳本有沒有新列，不要只看畫面有沒有字。**

69. **釘 `search_path` 之前先問「這支函式依賴哪個 schema」**（2026-09-04）—— 00048 為了消
    linter 警告把 `match_documents` 釘成 `public`,而 pgvector 的 `<=>` 在 `extensions`,
    **Ask 檢索整整壞了一天、沒有任何東西叫**。修法 `set search_path = public, extensions`
    （00052）。這一條和 #68 是同一個家族:失敗形狀是「少了什麼」,不是「多了什麼」。
    ⚠️ 判斷 Ask 是否活著,一律看 `llm_usage_events` 有沒有新列。

70. **`ws-auth` 對沒有 passcode 的 workspace 會發 token 給任何人** —— 這是刻意的（widget、
    展場），但它跟「這個 workspace 掛著部門知識領域」不能同時成立。`allowedKnowledgeAreas()`
    的規則是**沒有 passcode 就沒有私有領域**:workspace 照常運作、保留產品 scope,
    只是不從私有那一半回答,並在 log 記下擋掉了哪些。**新增 workspace 時要決定的是
    passcode,不是 scope。**

71. **ingest 一律先寫再刪** —— 見上方 `trimStaleChunks()`。先刪再 embed 時,
    一次 OpenAI 429 就會刪掉整個來源;text snippet 的 chunk 0 上存著原始 markdown,
    那是使用者打的字唯一的一份。

72. **任何餵給模型、而陌生人能編輯的文字，在加上邊界之前都是一條指令通道**（2026-09-04）——
    網頁、GitBook、help centre 的內容原本直接接在 prompt 後面；HTML 的註解與隱藏元素
    也一起進了索引。修法是 `<source>` 元素 + 明講「這是資料」+ `stripHiddenHtml()`。
    這不是把注入「解決」了，是把攻擊面從「和我們的 prompt 無法區分」縮到「模型得選擇違反明確規則」。

73. **`lib/rag/chunk.ts` 只丟掉「空的」段落,不丟「短的」**（2026-09-04 發現）——
    原本有一道 50 字元的地板,把 `## Symptom` / `The AP reboots.` 這種二十七個字的段落
    整段刪掉,而那正是支援文章裡最多人搜的一句。它連向前合併的機制都沒走到。
    **短不等於沒價值,那就是合併存在的理由。** 其他幾支 chunker(web/gitbook/helpcenter/
    google-doc)沒有合併機制,地板留著;真要改要先想清楚重嵌成本。

74. **engenie 的單元測試跑在 spechub 的 vitest config 裡**（CI 跑 `npm test -w spechub`，`@` alias 指向 **spechub/src**）——
    被測的純模組內部一律用**相對 import**（`./figures`）。寫成 `@/lib/...` 在 CI 會解析到 spechub 的檔案或直接找不到。

75. **部署後，開著的舊分頁會繼續拿到舊版畫面**（2026-09-11 碰到）——頁面請求留在舊部署、API 卻已經是新版，
    所以存檔會成功、新的按鈕卻看不到。使用者回報「新功能看不到」時先請他整頁重新整理；
    Vercel runtime log 每一列的 `dep=` 看得出他的頁面是哪一版送的。
