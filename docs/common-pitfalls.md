# Common Pitfalls (Archive 1–37)

> Earlier accumulated pitfalls extracted from CLAUDE.md to keep the working
> memo focused. The most recent items (#38+) stay inline in CLAUDE.md.
> Numbers preserved as historical references.

When working in a new session, **scan inline pitfalls in CLAUDE.md first**
— those are the active / recently-bitten ones. Reach for this file when
working on the older subsystems documented below (RAG ingestion, layout
metrics, auth setup, OAuth flow, Vercel cron, Next.js 16 proxy).

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

26. **Gitbook vision LED table dilution** — 原本 LED image 描述混在 page 的大 chunk 裡（跟封面、配件、mounting 圖混在一起），embedding 訊號被稀釋。解法：`ingest-gitbook.ts` 偵測 LED table pattern 後額外輸出一個 focused chunk（`chunk_index ≥ 10000`，含 bilingual header），標題乾淨如 `"ECW536 — LED Behavior"`

27. **`CitationTooltip` 連結判斷** — `ask-chat.tsx` 判斷 `source_type !== "product_spec" && (source_url.startsWith("http") || (wifi_regulation && source_url.startsWith("/")))`。新增有內部頁面的 source type 時要更新此條件

28. **Cover layout CJK metrics** — `cover-layout.ts` 的 `LOCALE_METRICS` 必須分開估 `overviewLineHeightPt` 和 `featureLineHeightPt`，因為 features 字比 overview 小（差 1pt）。用同一個 line-height 會 over-allocate features，壓縮 overview 導致假性紅燈。CJK 的 `coverGapPt` 用 10pt（非 20pt）買回空間。改 metrics 後務必用 `scripts/check-locale-layout.ts <model>` 驗證多個 locale

29. **Layout ack 格式** — `products.layout_ack` 目前兩種格式並存：legacy `true`（永遠 valid）和新 `{acked: true, hash: "..."}`（hash-bound）。讀取一律走 `isAckValid(ack, currentHash)` 判斷，別直接 `ack[locale] === true`。Hash 只涵蓋 overview + features（specs 不算，因為 spec overflow 非 per-locale）

30. **空翻譯誤判紅燈** — 啟用 ja 但還沒填 overview/features 時，若 fallback 到 EN 內容 + 用 CJK metrics 量，會假性紅燈。dashboard 和 product detail 兩處都有 `hasAnyTranslation` 守門，未翻譯時完全 skip 該 locale 的 check

31. **PDF 圖片尺寸用 `width` 不用 `max-width`** — `max-width` 只是上限，不會把小圖放大。如果來源圖檔比 CSS 上限小（例如 PM 上傳 150×150 PNG 但 max-width 設 260pt），圖會顯示自然尺寸而不是拉到目標大小。解法：用**顯式 `width: Xpt; height: Xpt`** 強制渲染到指定尺寸，`object-fit: contain` 保持 aspect ratio。Radio pattern PDF 頁就是這樣寫的（`.antenna-image img { width: 158pt; height: 158pt }`）。調過 9 輪才找到這個 root cause — 一有「改 max-width 還是太小」症狀就該想到這個

32. **Profiles RLS 無限遞迴** — Admin policies 寫成 `EXISTS (SELECT 1 FROM profiles WHERE role='admin')` 會導致 SELECT profiles 觸發 policy → policy 內的 SELECT 又觸發 policy → Postgres 回 `42P17 infinite recursion`。解法：抽出 `current_user_is_admin()` SECURITY DEFINER function，function body 的 SELECT bypass RLS。Policies 全部改用 `USING (current_user_is_admin())`。symptom 是「DB 有 row、auth.users 也有，但 getCurrentUser 回 null + redirect 到 no-access」

33. **Edge runtime + Supabase `from()` 不可靠** — Day 1 把 profile lookup 放在 `proxy.ts`（Edge runtime）裡，production 偶發 500。Edge 能跑 `auth.getUser()` 但跑 `.from("profiles").select(...)` 不穩。解法：proxy 只做 session refresh + redirect 沒登入；profile 白名單檢查移到 `(main)/layout.tsx`（Node runtime）。把所有需要 DB 查詢的東西留在 Node runtime

34. **Vercel Preview env vars 跟 Production 是分開的** — Production 設好 `NEXT_PUBLIC_SUPABASE_URL` 等不代表 Preview 也有。Preview deployment 看不到 env var → `createServerClient` 拿到 undefined → 整站 500。解法：env var 設定時要勾 All Environments（CLI: 用 Vercel REST API `POST /v10/projects/.../env` with `target: ["preview"]`），或在 Vercel Dashboard 三個環境都打勾

35. **Supabase OAuth `redirectTo` 嚴格比對** — `redirectTo` URL 帶 query string（如 `?next=/`）會跟 allow-list 的純 URL 比對失敗，Supabase 默默 fallback 到 `site_url` (production)。Preview branch 上的 user 會被 OAuth 完成後丟到 production，超詭異。解法：`redirectTo` 永遠送乾淨的 URL（無 query），post-login `next` 用 sessionStorage 暫存。callback 完成後 server redirect 到 `/auth/redirecting` (client page)，client 讀 sessionStorage 跳目的地

36. **Next.js 16 用 `proxy.ts` 不是 `middleware.ts`** — Next.js 16 把 middleware 改名為 proxy（功能一樣）。檔案在 `src/proxy.ts`，export `async function proxy(request)` 不是 `middleware`。如果同時有 `middleware.ts` 和 `proxy.ts` build 會直接 fail

37. **Vercel cron 用 `x-vercel-cron` header 區分** — `CRON_SECRET` env var 沒設（也不需要設）。Vercel cron 觸發 `/api/sync` 時自動帶 `x-vercel-cron: 1` header，這個 header 不能從外部 spoof。`gateOrCron()` 先檢查這個 header 再 fallback 到 `CRON_SECRET` bearer 再 fallback 到 user permission
