# 西文上線 · OpenRouter 遷移 · 花費帳本 · 翻譯審核

2026-08-06 ~ 08-07 一連串工作的交接文件。**這份的重點是「為什麼」**——
每個決定背後都有一個實測過的理由，光看程式碼看不出來，而且好幾個看起來
像不必要的複雜度。拆掉之前先讀這裡。

commit 範圍：`9530534` … `aa2bdf4`（24 個）。

---

## 0. 先講三個「不要拆掉」

這三件事最容易被後人當成多餘：

| 東西 | 看起來像 | 實際上 |
|---|---|---|
| `openai_api_key` 仍然存在 | 都改用 OpenRouter 了還留著？ | **RAG embedding 不走 OpenRouter**，換 embedding model = 整個知識庫重建索引 |
| 模型目錄用 slug 當識別碼 | 為什麼不用短 id？ | 舊的短 id 顯示名稱早已漂走（`gpt-4o` 實際打 gpt-5.5），存下來的值無法告訴你用了什麼（見 §8）|
| 我們自己記 LLM 花費 | OpenRouter 後台不是有嗎？ | **公開 API 無法依 key 拆分花費**（見 §4），照它做出來的數字會是錯的 |
| `review_locales IS NULL` 不算「指定審核者」 | 這個判斷式好奇怪 | 若算的話，**第一個 admin 就會讓所有語言都變成需外審**（見 §5） |

---

## 1. 西班牙文（es-MX）

**為什麼便宜**：EN 用的 Roboto 已覆蓋 Latin Extended，`charWidth()` 把西文字元算 1
（跟英文同路徑）。日文中文當初要整套字型註冊 + CJK 寬度分支，西文都不用。

**動到的檔案**：`locales/types.ts`（union + `SUPPORTED_LOCALES`）、`locales/es.ts`、
`locales/index.ts`、`translate/prompts/locales/es.ts` + `translate/index.ts` 註冊。
**DB 不用動**——`locale` 是無約束的 text。

### ⚠️ 兩個跟舊 recipe 不同的決定

CLAUDE.md 舊的 Next Steps #9 說要加 `cover-layout.ts` 的 `LOCALE_METRICS` 和
`typography.ts` 的 `TYPOGRAPHY_DEFAULTS`。**兩個都不要加**：

1. **`LOCALE_METRICS` / `LOCALE_ROW_METRICS` 不加 `es`** —— 拉丁語系落到 `default`
   本來就是對的（同字型、同尺寸）。複製一份只會在有人調其中一邊時漂移。
2. **`TYPOGRAPHY_DEFAULTS` 不加 `es`** —— `cjkFontFor()` 當初用「有沒有 defaults entry」
   推導「是不是 CJK」。加上去會讓 `cjkFontFor("es")` 回 Roboto，**被塞到 Data Center
   版型的 Manrope 前面，整份 DC 西文 datasheet 悄悄換字體**。已改成明確的
   `CJK_LOCALES` set（pitfall #68）。

**衍生規則：per-locale typography 是 CJK 專屬功能。** 拉丁語系不該有 defaults entry，
也不該出現在 typography 設定頁。

---

## 2. 行數預算（防破版）

### 核心洞見：破版的是「行數」不是「字數」

西文比英文長 15–25%。封面是固定 486pt、features box 硬上限 320pt。
ECS1552FP 不設限直翻的實測：

| | 英文 | 西文（無預算）|
|---|---|---|
| Features 需要高度 | 280pt / 上限 320 | **325pt** ❌ |
| Overview 可用空間 | 186pt | 146pt（被擠掉）|
| 安全餘裕 | 41pt | **1pt** ❌ |

**但「字數 ≤ 原文 ×N」是錯的規則**：第 6 條 feature 字數 +11% 卻沒換行（無害），
第 9 條 +37% 多一行（破版）。1.05 倍規則會擋掉前者、放過後者。

### 做法

`lineParityBudget()` 在 **`cover-layout.ts`**，不是 `lib/translate/`——
刻意跟版面 metrics 放同一支，**「給模型的預算」和「事後檢查的紅綠燈」不可能對不上**。
翻譯 prompt 的 **Layer 6** 把每條的字元預算注入（`原文行數 × 該語系 chars/line`，
CJK 目標再除以 2）。

**實測有效**：同一台從 🔴 OVERFLOW 變 🟢 fits（features 295pt / overview 餘裕 26pt）。

⚠️ **但模型把預算當強提示，不是硬上限**——10 條裡 3 條超出 3–8 字元。這次沒事是因為
預算訂得夠保守。真的邊緣時 UI 紅綠燈還是會擋。

驗證工具：`scripts/check-translation-budget.ts <MODEL> <locale> [--dry-run]`
（`--dry-run` 不用 key、不花錢，直接印出注入的預算段）。

---

## 3. OpenRouter 遷移

**動機**：三家各自直連、各自一把 key，而且**根本沒有 Anthropic key**——
但程式預設 provider 是 `claude-sonnet`，所以 battlecard 的 ↻sync / 🔍web
**自上線以來一直回 400**。

**新 package `@eg/llm`**（`chatComplete` / `openRouterEnabled` / `openrouter-account`）。

### 兩種遷移策略，刻意不同

| 範圍 | 策略 | 為什麼 |
|---|---|---|
| translate | 當時：OpenRouter 優先、沒 key 就 fallback 回直連。**fallback 已於 Phase 2 刪除**（見 §8）| 當時是為了「還沒設 key 就部署也不會壞」 |
| battlecard | **OpenRouter only** | 它本來就一直 400，沒有可退的路 |
| **embeddings** | **完全不動** | OpenRouter 不提供 embedding；換模型 = 全量重建索引 |

### 兩把 key，兩個統計桶

```
Surface = "spechub" | "ask"
  spechub → openrouter_api_key      （翻譯 + battlecard，不分開算）
  ask     → openrouter_api_key_ask  （沒設就 fallback 回 spechub 那把）
```

Ask 完整優先序：**workspace BYOK key > `openrouter_api_key_ask` > spechub key**。
Marketing 的 demo 是 `llm_mode='shared'`，所以吃 `openrouter_api_key_ask`。

⚠️ 中間一版做過 `KeyPurpose` / `KeyGroup` 兩層抽象（多 surface 共用 key 但分開報帳），
使用者決定不需要那麼細後已移除。**不要再加回來**——想要更細的歸因不必改 schema，
ledger 每列都有 `ref`。

查 model slug：`scripts/list-openrouter-models.ts <關鍵字>`（公開端點免 key，附價格）。

---

## 4. 花費帳本（`llm_usage_events`，migration 00033）

### 為什麼不用 OpenRouter 的 per-key 統計

用 management + provisioning scope 的 key 實測（2026-08-06）：

- `GET /keys` **只列出用 provisioning API 建立的 key**，dashboard 手動建的列不到
  （帳上三把 key 一把都沒出現，只回一把無關的 "Default key"）
- `GET /activity` 的 `group_by` **enum 只有 `workspace`**，沒有 api_key

照這個做出來的表會顯示一把無關的 key = $0，**看起來在運作，實際上是錯的**。

### 做法

`/chat/completions` 的 response `usage` 就帶 `cost` + `is_byok`，
`chatComplete` 每次 **fire-and-forget** 寫進 `llm_usage_events`
（帳本寫失敗絕不能拖慢或弄壞一次翻譯）。聚合走 RPC `llm_spend_summary(days)`。

- `surface` = 用哪把 key 付的（也是統計桶）
- `ref` = 產品型號 / workspace slug ← **更細的歸因不用改 schema**
- BYOK 有記錄但**排除在公司花費外**

⚠️ numeric 經 PostgREST 回來是**字串**（pitfall #55 同源），前端要 `Number()`。

**成本參考**：翻一台產品約 $0.015，整條線的規格標籤 $0.006 一次。

餘額頁 `/settings/ai-usage`（engenie，權限 `billing.view` admin only）。
⚠️ **`/credits` 和 `/activity` 需要 management key**（一般 inference key 403）。
management key 放 **Vercel env `OPENROUTER_MANAGEMENT_KEY`**，刻意不放 API Keys 設定頁
（provisioning scope，權限高一級）。**要加在 `engenie-eg` 專案上，不是 spechub。**

---

## 5. 翻譯審核流程（migration 00034）

### 三態取代 boolean

一旦審核者可以「留意見但不通過」，**「寫了意見」和「還沒人看」就不再是同一件事**，
MKT 需要把前者當成待辦。

```
draft → changes_requested → approved
```

`confirmed` 改成 **generated column**（`review_status = 'approved'`），
所以兩者不可能對不上，而且**審核者按退回 → PDF 生成自動被擋**，不需要另一段同步程式。

⚠️ **`confirmed` 是唯讀的，要寫 `review_status`。**

### Per-locale 政策（最需要小心的一段）

**「有人被指定審該語言」才需要外部審核**，其他語言維持 MKT 一鍵核准
（`localeHasDesignatedReviewer()`，@eg/auth/session，60s cache，**fail open**）。

> ⚠️ **`review_locales IS NULL` 不算「指定」。**
> NULL 代表「可審全部」（admin）。若它算數，**第一個 admin 就會讓所有語言都變成
> 需外審**，把日文中文的一鍵核准悄悄拿掉。只有明確列出的陣列才算。
> 已在 prod 實測：指派一人到 `['es']` → es 需審、ja 不需（現場 4 個 NULL 沒污染）。

指派方式：`/settings/users` 點該人那列的語言旗標（同時給權限 + 開啟該語言的審核）。

### 其他刻意的決定

- **意見是 append-only log**（`translation_reviews`），不是欄位——審核是來回的，
  欄位每輪會被蓋掉。`target_field` + `target_index` 可指到「第 3 條 feature」。
- **「只留言」不改變狀態**——小意見不該悄悄擋住或放行 PDF。
- **退回沒填意見是 DB check constraint 擋的**，不只 UI。
- 佇列頁 `/translations/queue` 是**雙向**的：審核者看自己語言的待審、MKT 看被退回的
  （帶最新意見）。gate 在 `product.view` 不是 `review.approve`——MKT 沒審核權但要修東西。

### PM 權限

`pm` = 純審核角色，**不能編輯翻譯、不能產 PDF、不能用 Ask**（後者權限檔註解說是刻意的）。
2026-08-07 加開 `settings.view` + `settings.edit_glossary`——
**審核者才是會對用詞有意見的人**，讓他們自己改詞彙表，不用透過工程師。

⚠️ **目前沒有任何單一角色能「既編輯又審核」（admin 除外）。** 如果分公司想自己
改西文而不是退回，`pm` 不夠用，需要第五個角色（editor + review.approve）。
建議先跑一輪真實案子看他們的反應再決定。

---

## 6. 部署：拿掉 GitHub Actions 繞道

engenie 曾用 `.github/workflows/deploy-engenie.yml`（CI 建好再上傳），
因為「Vercel 雲端建置對新專案會失敗」。**那個判斷是錯的**——

真正原因是 `apps/engenie/src/app/globals.css` 的 `@import "shadcn/tailwind.css"`，
而 `shadcn` **只宣告在 `apps/spechub/package.json`**。本機和 CI 因 workspace hoisting
都找得到，Vercel 的單 app 安裝找不到。補一行依賴 → Vercel 自建 1 分鐘 Ready。

workflow 已刪、Ignored Build Step 已改回 Automatic、`VERCEL_TOKEN` secret 可撤銷。
副作用：**feature branch 現在也有 engenie preview 了**（舊 workflow 只跑 main）。

### 🔁 同一個雷已經踩三次

**本機 workspace hoisting 會遮住「有 import 但沒宣告」的依賴**，本機 build 全綠，
只有 Vercel 的乾淨／單 app 安裝會爆：

1. spechub `globals.css` 殘留 `highlight.js` import → `febaf09`
2. `@eg/llm` 新 package 沒加進兩個 app 的 dependencies → `6ebc08d`
3. engenie `globals.css` 的 `shadcn` 只宣告在 spechub → `d6e20ac`
   （**害大家以為 Vercel 平台壞掉兩個月**）

> **法則：`globals.css` 的 `@import` 和程式的 import，都要在「真正用它的那個 app」
> 的 package.json 裡宣告。本機 build 通過完全不能證明依賴宣告正確。**

---

## 7. 其他修正

- **Glossary**：翻譯頁的連結有帶 `?locale=es` 但頁面忽略它（落在日文）。scope 清單
  寫死 5 條線、**過期了 10 條**（新線完全無法設專屬詞彙）→ 改成從 `product_lines` 讀。
- **Glossary scope 邏輯只有兩層**：`global`（翻任何東西都帶）+ 產品線（只有該線帶）。
  翻譯時 `scopes = ["global", productLine]`，**產品線的詞疊加在 global 之上，不是取代**。
  同一個英文詞兩邊都定義的話，模型會看到兩個指示——**避免重複定義**。
- **西文用詞規則已從 prompt 搬進 Glossary**（14 條，`es`/`global`）。Layer 2 只留
  Glossary 存不了的：長度限制、地區文法、哪些縮寫保持英文。
- **Version History 的語意**：只列出**由 SpecHub 產生**的 PDF。`current_versions` 的
  數字則來自 Drive 資料夾掃描——**56 台有英文版號，其中 23 台沒有英文歷史**。
  卡片已在有落差時說明，不再顯示誤導的 "No versions generated yet"。
- **`resync-versions` 已擴到所有語言**，但**只掃該產品實際有翻譯的語言**
  （全掃會讓 Drive 呼叫變三倍去找大多不存在的資料夾，撞 60s 上限）。

---

## 8. Phase 2：Ask 遷移 + 模型目錄（2026-08-07）

### Ask → OpenRouter

三支手刻 SSE parser（Anthropic `content_block_delta` / OpenAI SDK 迴圈 /
Gemini `parts[]` 還要濾 thought）收斂成一支 `streamComplete()`，route 少約 150 行。

- **`thinkingBudget: 0` → `reasoning: { effort: "none" }`** —— 同一個 pitfall #61 的修正，
  換了機制。**而且不再寫在程式裡**，設在 `llm_models.reasoning_effort`。
- **Ask 花費終於進帳本** —— OpenRouter 串流一律附 usage
  （`stream_options.include_usage` 已 deprecated 就是因為無條件包含），
  標 `surface="ask"`、`ref` 是 workspace slug。**這是當初分兩把 key 的目的**。
- **BYOK 沒被弄壞**：5 個 workspace 全是 `shared` 且沒存 key。但從此
  **workspace 的 BYOK key 必須是 OpenRouter key，不是廠商 key**。

### 模型目錄（`llm_models`，migration 00035）

兩份寫死清單 → 一張表 + **EnGenie `/settings/models`**（admin only），跟 API Keys、
AI 用量並列。（一度放在 spechub，只因為 surface enum 當時在那 —— 結果 AI 設定散在
兩個 app，使用者找不到頁面。spechub 只留一支唯讀端點給自己的翻譯下拉。）

> ⚠️ **slug 就是識別碼。** 舊的短 id 是穩定 key，但顯示名稱早就跟實際呼叫的東西漂開
> （`gpt-4o` 打 gpt-5.5、`gemini-2.5-pro` 打 gemini-3.1-pro），所以**存在任何地方的值
> 都無法告訴你用了什麼模型**。現在存的就是打的。
> 轉換 `ask_workspaces.provider` 用**明確對照表**，不是加前綴 —— `claude-sonnet` 是
> `claude-sonnet-4.6`、`gemini-3.1-pro` 是 `gemini-3.1-pro-preview`，加前綴會產生不存在的模型。

**三家直連的 translate client 已刪除。** 當初留著是為了「還沒設 key 就部署也不會壞」，
OpenRouter 既然已在 prod 跑過真實翻譯，那個情境不會再發生。per-vendor 的
「有沒有 key」探測也一起消失 —— 一把 key 通所有模型，「能不能用」＝「這一列在不在」。

未知或剛停用的 slug 會**降級到該 surface 的預設**（picker 的選項可能在載入到送出之間改變），
但 `/api/translate` 仍會**直接拒絕**未知 slug —— 呼叫端打錯字要當成錯誤，不能默默跑別的模型。

---

## 9. 還沒做 / 待確認

1. **日文規格標籤 0/43** —— `spec_label_translations` 只有 zh-TW 有 445 筆，
   ja 和 es 的分類/欄位名稱是英文。產 PDF 寫死 `mode=full`，所以日文 datasheet
   的規格表**一直是英文的**。刻意還是漏的？未確認。
2. **ECS1552FP 的西文 PDF 還沒產**（翻譯已核准，但沒有 es 版號）。
3. **審核尚未啟用** —— 沒有人被指定，所以西文仍是 MKT 一鍵核准。
4. **是否需要第五個角色**（見 §5）。
5. ~~Ask 尚未遷移到 OpenRouter~~ —— **已完成（見 §9）**。
6. **`translation_mode`（light/full）欄位對渲染沒有作用** —— 編輯器可以設，
   但渲染路徑都吃 URL 的 `mode` 參數，產 PDF 更是寫死 `full`。要嘛接上、要嘛移除。
