# Common Pitfalls (Archive 1–25)

> Earlier accumulated pitfalls extracted from CLAUDE.md to keep the working
> memo focused. The most recent / cross-cutting items (#26–#37+) stay
> inline in CLAUDE.md. Numbers preserved as historical references.

When working in a new session, **scan inline pitfalls in CLAUDE.md first**
— those are the active / recently-bitten ones. Reach for this file when
working on the older specific subsystems below.

---

1. **Google Sheets UNFORMATTED_VALUE 回傳 Excel serial number** — 日期欄位會是 5 位數字（如 45512），需轉換。`parseRevisionDate` 先檢查 8/6 位 compact 格式，最後才檢查 serial number（限定 5 位 + 30000-60000 範圍）

2. **Shared Drive 需要 `supportsAllDrives: true`** — Drive API `files.get` 不加這個參數會 404

3. **Telegram 訊息 4096 字元上限** — 同步多產品時超長訊息要截斷到 4000 字

4. **Brave 瀏覽器 PDF 多空白頁** — Brave 的 print engine 有差異，建議用 Chrome 存 PDF。已加 JS `beforeprint` event 用 body height clamping 盡量緩解

5. **Comparison dynamic category detection** — 判斷邏輯：row 所有 model column 完全空白（連 `-` 都沒有）才算 category。`-` 代表 "不適用"，算有值

6. **Web Overview features 格式** — Sheet 裡的 Key Feature Lists 是純換行分隔文字（非 `* ` bullet 格式），parser 需要處理兩種格式。label 欄位本身可能含換行（如 `"Key Feature Lists \n (條列式功能)"`），用 `includes()` 匹配而非 exact match

7. **Compare table 欄位壓縮** — table 必須用 `min-w-max`（非 `w-full`），否則 24+ model 欄位會被壓縮到容器寬度。搭配 `overflow-auto` 讓表格在卡片內橫向滾動

8. **Table sticky header 需要 `overflow-x-clip`** — base Table 元件的容器用 `overflow-x-clip`（非 `overflow-x-auto`），否則 `position: sticky` 無法穿透 scroll container 生效

9. **Supabase 不認得新建的 table** — `product_translations` 等新表的 query 會被 TypeScript 推斷為 `never`。解法：`supabase.from("product_translations" as "products")` + 手動 `as { data: T | null }` 型別斷言

10. **AI 翻譯 JSON 解析** — prompt 要求回 JSON `{ translated, notes }`，但有些 model 會加 markdown code fence。`index.ts` 有 fallback：strip ``` 後 parse，失敗就當 plain text

11. **zh-TW locale 在 Drive 用 zh** — `getLocaleSuffix("zh-TW")` 回傳 `"zh"`，資料夾命名和 PDF 檔名用 `_zh` 不用 `_zh-TW`

12. **Gemini API model 名稱** — 翻譯用 `gemini-2.5-pro`（加 `responseMimeType: "application/json"` 穩定 JSON 輸出）。Ask RAG 用 `gemini-2.5-flash`（預設）或 `gemini-2.5-pro`。注意：`-latest` suffix 已棄用

13. **Preview CSS 動態化** — per-locale 的字級/字重/顏色不再 hardcode 在 CSS，而是從 `app_settings` 讀 `typography_${lang}` JSON，fallback 到 `TYPOGRAPHY_DEFAULTS[lang]`

14. **Gemini 回應解析** — streaming 模式下用 `streamGenerateContent?alt=sse` endpoint，parse SSE events，skip thinking parts

15. **chat_sessions messages 格式** — 存入時直接傳 raw array 給 Supabase JSONB，**不要** `JSON.stringify()`

16. **Spec category detection is pattern-based** — 早期用硬編 whitelist 會漏抓許多 category，現在改成「整列所有 model 欄位皆空（連 `-` 都沒有）」才算 category header。`-` 意思是「不適用」算有值。strikethrough 文字會在 `cellToCleanValue()` 裡被 `textFormatRuns` 過濾掉

17. **Gitbook HTML→text 噪音** — Gitbook chatbot widget、banner、SVG icon alt text "hashtag" 會汙染 chunk。htmlToText 已加清理

18. **Gitbook 圖片 URL** — proxy URL（`/~gitbook/image?url=...&sign=...`）server-side fetch 會 400。需提取原始 `files.gitbook.io` URL，且保持 `%2F` encoding 不被 double-decode

19. **Google Doc export=txt 無 heading** — plain text export 丟失 markdown 結構，需用 numbered section pattern (`\d+\.\s+[A-Z]`) 作為 chunk 分割點

20. **Flex scroll 需要每層 min-h-0** — 巢狀 flex 容器的每一層都需要 `min-h-0` 才能讓子元素 `overflow-y-auto` 生效

21. **Smart image sync** — `syncProductImages` 比對 Drive `modifiedTime` vs Storage `last-modified`，Drive 更新才重新下載

22. **Google Docs markdown export 兩個陷阱** — (a) 標記 escape：`[v1.2]` 變 `\[v1.2\]`，tab-split regex 必須吃 `\\?\[`；(b) 圖片 ref 定義 `[imageN]: <data:image/png;base64,...>` 會把一個空 tab 變成 9MB 內容，`ingest-google-doc.ts` 用 `stripImageRefs()` 過濾

23. **Supabase PostgREST db-max-rows 1000 硬上限** — client 端的 `.limit(50000)` 會被伺服器端 cap 覆蓋，產出**靜默截斷**（不報錯）。需要用 `.range(page*1000, (page+1)*1000-1)` 分頁迴圈抓完整資料集。`/api/documents` GET 就是這樣抓 2987+ rows

24. **Vision API `maxOutputTokens` 預設太小** — 2-4 句描述夠用的預設值（300）會把 12 行 LED table 壓成摘要。`vision.ts` 提到 2000，並在 prompt 裡明確要求 tables 輸出完整 markdown

25. **`text-embedding-3-small` 跨語言 retrieval 偏弱** — 中文 query 抓英文 chunk 時相似度常常低於 threshold。解法是在 `/api/ask/route.ts` 加 literal-match supplementary lookup（model/country regex）+ re-rank，詳見 RAG section
