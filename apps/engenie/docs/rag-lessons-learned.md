# RAG / LLM 應用實作 — Lessons Learned

> 從 EnGenie Ask 的效能 + 資安 hardening（2026-07-05）萃取出的通用經驗。
> 下次做 RAG 或任何串接 LLM API 的工具/系統時，拿這份對照一遍。

---

## 一、核心心法

1. **延遲是一條「串行鏈」，不是單一慢點。**
   使用者等 5 秒，通常不是某一步慢 5 秒，而是 8 個 0.5 秒的步驟排隊。
   → **先量每一步、再優化**。不要憑感覺猜瓶頸。

2. **分清「實際延遲」與「體感延遲」。**
   有些優化縮短真實時間（平行化、快取），有些只改善感覺（先顯示狀態/來源）。
   兩者都要做，而且體感優化往往 CP 值最高、風險最低。

3. **首 token 時間（TTFT）才是體驗指標，不是總時間。**
   使用者看到第一個字就安心了。優化目標是「多快開始回應」，不是「多快講完」。

---

## 二、延遲優化（照效果排序）

### 1. 砍掉「白等」——推理預算（thinking budget）
- 會思考的模型（Gemini Flash thinking、OpenAI reasoning models）在**第一個字之前**先在伺服器端推理，這段時間使用者只看到空白。
- **RAG / 摘要 / 資料整理類任務幾乎不需要深度推理**——資料都在 context 裡，模型只是重組。
- 實測：Gemini Flash 關掉 thinking，首字 **18s → 1.2s**，品質不變。
- 原則：**讓推理深度匹配任務**。需要多步推理（數學、規劃、程式）才開；查答案類就關。

### 2. 平行化——能同時做的不要排隊
- 盤點「不依賴前一步結果」的工作，用 `Promise.all` 一起發。
- RAG 常見可平行項：讀 API 金鑰、讀 persona/設定、產生輔助 prompt，都可以跟「向量搜尋」同時跑。
- 注意：平行發出的 promise 要各自 `.catch` 成 fallback，避免 unhandled rejection。

### 3. 快取熱路徑——重複的事只做一次
- **設定 / 金鑰**：每次請求都打 DB 讀金鑰很浪費。in-process TTL 快取（如 60s）即可，寫入端記得 invalidate。
- **查詢 embedding**：同一個問題的向量是固定的。LRU 快取命中率意外地高——追問按鈕、範例問題、熱門問題都是逐字重送。實測重複問題首字 4.1s → 0.6s。
- 快取失效策略：TTL 適合「偶爾變、可容忍短暫舊值」；寫入 invalidate 適合「改了要立刻生效」。兩者常一起用。

### 4. 串流 + 中間訊號——體感優化
- **一定要串流**（SSE / streaming API）。逐字吐比等整段快感受天差地遠。
- 送**狀態事件**：「搜尋中…」→「整理回覆中…」，讓使用者知道系統在動。
- **來源/引用提早送**：RAG 檢索一完成，來源就確定了——別等 LLM 講完才顯示。先推來源，使用者 2 秒就看到「找到了什麼」。

### 5. 控制 context / history 大小
- 送進 LLM 的內容越大，prefill 越久、TTFT 越慢、成本越高。
- 對話歷史要設**字元/token 預算**（不是只限「幾則」——一則長回答可能就上萬 token）。
- 答案若採「先講結論」的格式，截尾部比截開頭安全。

---

## 三、RAG 檢索專屬注意事項

1. **向量索引的選擇會靜默影響召回率。**
   ivfflat 的 `lists`/`probes` 設不好，每次只掃一小部分向量，相關結果在進入 re-rank 前就被丟掉了（而且不會報錯）。語料不大時 **HNSW** 通常召回/延遲都更好、免調參。

2. **「字面比對」的查詢也要建索引。**
   RAG 常搭配關鍵字/型號補查（`ILIKE '%ECW230%'`）。這類查詢沒有索引 = 全表掃描，且會隨語料成長越來越慢。用 **pg_trgm GIN 索引**（或改查有 GIN 索引的 metadata 欄位）。別以為建了向量索引就沒事。

3. **檢索 embedding 只用「當前問題」，不要串對話歷史。**
   把歷史串進去會讓前一題的主題污染這題的向量搜尋（換主題時，系統以為知識庫只有前一題的內容）。歷史只進 LLM 的 prompt，不進向量搜尋。追問建議也要求 LLM 產生「自包問句」。

4. **跨語言檢索要調低相似度門檻 + 靠 re-rank 補精度。**
   中文問題 ↔ 英文文件的 embedding 相似度天生偏低。門檻設太高會查不到；設低一點、拉大候選池、再 re-rank。

5. **scope / 權限過濾要「密不透風」。**
   如果有補充查詢（cross-lingual、字面比對）繞過主查詢，最後要**再套一次 scope filter**，否則補進來的 chunk 可能洩漏出範圍外的內容。對外 API 尤其要嚴格。

6. **ingest 用 content_hash 短路重複工作。**
   內容沒變就跳過重新 embedding（embedding 是最貴的一步）。但 metadata（taxonomy/tag）要能獨立刷新，別跟 content_hash 綁死。

---

## 四、資安 / 正確性（做 AI 工具很容易漏的）

1. **多租戶/隱私：資料要綁使用者。**
   對話紀錄、上傳檔案這類 per-user 資料，建立時寫入 user_id，**所有查詢都要過濾 user_id**。別只靠「有登入就好」的粗略 gate。

2. **RLS 當防禦縱深，但別當唯一防線。**
   server 端用 service-role key（繞過 RLS）+ 應用層 RBAC 是常見架構。這種情況 RLS 設成 deny-all backstop——萬一應用層有漏，DB 這關還擋得住。

3. **公開的 passcode / 登入端點要限流。**
   無鹽 hash 的短 passcode 可以線上爆破。加「每 IP 每時間窗 N 次」限流，**放在 hash 比對之前**（順便消除 timing side-channel）。DB-backed 才能跨 serverless 實例共享（in-memory 會在冷啟動歸零）。

4. **ingest 抓任意 URL = SSRF 風險。**
   讓使用者貼 URL 索引時，fetch 前要擋掉內網目標：loopback、RFC1918、link-local、雲端 metadata IP（`169.254.169.254`）、十進位/十六進位 IP 變形。

5. **秘密處理。**
   - API 金鑰放 **header 不放 URL**（URL 會進 log）。
   - 錯誤訊息/stack trace 回前端或寫 log 前先 **redact** 掉像金鑰的字串（provider 的錯誤 body 常把你的 request 原封回傳）。

6. **Migration 是 schema 的唯一真相。**
   直接在 prod 改 schema/RLS 很方便，但一定要補一份對應的 migration，否則重建 DB 或開 branch 時狀態會漂移。

7. **前端要有 Error Boundary。**
   LLM 吐出畸形 markdown/JSON 時，只讓那一則降級成純文字，別讓整個 UI 白掉。

---

## 五、通用的請求生命週期骨架

不管 RAG 與否，串 LLM 的請求大致都是這個形狀：

```
[Auth/限流]  →  [平行準備工作]  →  [串流 LLM]  →  [後處理]
   ↓                ↓                  ↓              ↓
 rate limit      金鑰/設定/           逐字 SSE      存紀錄/
 綁 user         (RAG:檢索)          + 中間訊號     算 metadata
                 全部 Promise.all
```

- **Auth/限流**放最前面，擋掉不該進來的。
- **準備工作**盡量平行、盡量快取。
- **串流**是體驗核心，中間訊號降低體感延遲。
- **後處理**（存 DB、算統計）別擋住回應——能非同步就非同步。

---

## 六、換成「非 RAG」的純 LLM 應用，一樣嗎？

大部分優化**原則一樣**，因為它們是關於「你怎麼呼叫 LLM、怎麼編排請求」，跟 RAG 無關。但有一半可以拿掉、又多出幾個新槓桿。

### 照搬得動的（通用 LLM 應用架構）
- 平行化準備工作、快取金鑰/設定
- 串流 + 中間狀態訊號（體感延遲）
- 推理預算匹配任務（thinking budget）
- 控制 context / history 大小
- TTFT 當指標、秘密處理、端點限流
- 那個「Auth → 平行準備 → 串流 → 後處理」的骨架完全一樣

### RAG 專屬、非 RAG 用不到的
向量索引、embedding 快取、檢索污染、chunk / scope 那一整塊——沒有檢索就沒這些事。

### 非 RAG 反而多出來的槓桿（差異重點）

1. **Prompt Caching 變成最大的一塊。**
   如果 system prompt 很長、或每次都帶同一份大 context（說明書、程式碼、規則），Claude / OpenAI 都能把「固定前綴」快取起來，重複請求時大幅降低 TTFT 與成本。RAG 每次檢索到的 context 都不同，較難吃到；**固定 prompt 的應用吃得最滿，該列為優先。**

2. **Tool calling / agent loop 會多出往返成本。**
   有 function calling 時，每一輪「模型決定呼叫 → 執行 → 結果送回模型」都是一次完整 LLM 往返，延遲會疊加。優化重點變成**減少來回次數**：批次工具、平行工具呼叫、一次把能給的資訊給足。

3. **結構化輸出**（JSON schema / structured output）有自己的延遲與可靠度考量，跟自由文字不同。

> 一句話：**「怎麼跟 LLM 說話、怎麼串請求」的優化通用；「怎麼找資料餵給它」的優化才是 RAG 專屬。** 換成一般 LLM 應用，把檢索那塊換成「你的 context 從哪來」，其餘架構照舊，再把 **prompt caching** 加進優先清單就對了。

> ⚠️ prompt caching、reasoning 參數的**具體設定與計價**各家不同也常改版，實作時直接查該 provider 當下的 API 文件，別靠記憶。

## 七、一頁 Checklist

- [ ] 量過每一步的延遲了嗎？（不要猜瓶頸）
- [ ] 推理預算匹配任務了嗎？（查答案類關掉 thinking）
- [ ] 不相依的準備工作都平行了嗎？
- [ ] 金鑰/設定/query-embedding 有快取嗎？寫入端有 invalidate 嗎？
- [ ] 有串流嗎？有送狀態 + 提早送來源嗎？
- [ ] context/history 有大小上限嗎？
- [ ] （RAG）向量索引選對了嗎？字面查詢有索引嗎？
- [ ] （RAG）embedding 只用當前問題嗎？scope 過濾密不透風嗎？
- [ ] （非 RAG）固定的長 prompt / context 有開 prompt caching 嗎？
- [ ] （非 RAG）tool calling 的往返次數有壓到最少嗎？
- [ ] per-user 資料有綁 user_id 嗎？公開端點有限流嗎？
- [ ] 秘密有 redact、金鑰放 header 嗎？
- [ ] schema 改動有補 migration 嗎？
```
