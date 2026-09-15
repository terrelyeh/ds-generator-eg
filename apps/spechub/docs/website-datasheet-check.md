# 官網 Datasheet 查詢（website datasheet check）

> 2026-09-15 上線 1a 查詢（PR #92）；2026-09-16 做完 1b 標記與提醒（見文末）。
> **動 `lib/website/`、`/api/website/*`、`/api/cron/website-check`、產品頁「官網」分頁或 `/website` 之前先讀這份。**

## 做什麼

讀 EnGenius 五個區域官網（EU / JP / TW / APAC / IN，各有正式站和測試站）上的 datasheet，
對照 SpecHub 目前的版本，告訴行銷「哪一站還沒上、等推送、還是舊檔」。

- **產品頁「官網」分頁**：這個型號在五站的狀況。開頁顯示上次的結果，按「重新查詢」才打官網
- **`/website` 官網查詢**：依型號（不在 SpecHub 的也能查）、依站台（可複選 + 類別 + Wi-Fi 世代）
- 只有 **admin / editor** 看得到（`website_check.view`）
- **只讀取，不寫官網**。上架功能刻意延後（Terrel 的決定）

這是線下 skill `wp-ds-check` / `wp-launch-check`（`~/.agents/skills/`）的線上版。
**兩邊答案可能不同**：skill 拿站跟站比，這裡拿站跟 SpecHub 的版號比。
五站都是 v1.3、SpecHub 已經是 v1.4 時，skill 說一致，這裡說待上架。

## 官網那一側：只讀公開 REST，伺服器上沒有 WordPress 帳密

2026-09-15 實測（本機 + Vercel `hnd1` preview）：十個站**不用帳號**就讀得到需要的全部欄位 ——
`product_model` 的 ACF（含 `product_files`）、`file` 的 ACF 與附件
（`download_link`：`date` / `modified`（GMT）、`filesize`、`author`、`url`）。
所以**沒有放任何 Application Password**；代價是看不到草稿。`/api/website/probe` 可以隨時重跑這個檢查。

- 設定只有網址：`WP_{EU,JP,TW,APAC,IN}_URL`、`WP_*_STG_URL`（名稱沿用 skill 的 `.env`）。
  Vercel Preview 與 Production 都已設（Vercel 預設標成 Sensitive）；**本機開發要自己放進 `apps/spechub/.env.local`**，
  不然每站都會回「還沒設定這個站的網址」
- 五個正式站同在 `www.engeniustech.com`（路徑分區），測試站是 `www.stagingNN.engeniustech.com`
- 每個請求 1–4 秒（測試站較慢）

## 🔴 正式站是測試站「整站覆寫」過去的，而且是人手動按

所以：
- **正式站的日期就是當初在測試站上傳的日期**，WordPress 裡**沒有**「正式站上線時間」。
  要知道推送時間只能自己記（1b：每日檢查看到正式站整批變成跟測試站一樣時記下）
- **推送是整站一次**，所以「待推送」要以站為單位提醒，不是一台一台
- **直接改正式站的東西，下次推送會被洗掉** → `prodnewer` 排最優先
- 負責推送的是**同一個人，而且他不用 SpecHub**，只收 Telegram（1b，小群組）

## 判斷規則（`lib/website/compare.ts`，有測試）

一個型號在一站：只有「**單台** + **掛在產品頁** + 已發佈」的 datasheet 決定狀態；系列 / 平台版號獨立，只列出不比對。
各語言各自比，**一站只欠 SpecHub 一種語言**（TW：有繁中就不要求英文，`SITE_LANGUAGES` 的第一個 SpecHub 有的語言）。

| 狀態 | 條件（依序，先中先贏） |
|---|---|
| `prodnewer` 正式站較新 | 正式站比測試站新，或只有正式站有 |
| `ok` 已是最新 / `diff` 檔案不同 | 正式站 = SpecHub 版號；**檔案大小不同就是 diff** |
| `push` 待推送 | 測試站已是 SpecHub 版號（或同版號但換成 SpecHub 的檔案） |
| `newer` 站上較新 | 站上版號比 SpecHub 新 |
| `todo` 待上架 | 以上都不是 |
| `same` / `push` / `notyet` / `mismatch` | SpecHub 沒有這個語言：只比正式站和測試站 |

**檔案大小是指紋**：Regenerate 會用同一個版號覆蓋 PDF，站上那份版號對、內容舊。
Chromium 產的 PDF 內含 `/CreationDate`，雜湊每次都不同，**所以比大小不比雜湊**。
實測 JP 的 ECW536 日文 v1.4 跟 SpecHub 那份 1,593,753 bytes 完全相同；
EU 的英文 v1.3 是 2024 年的舊檔（1.29 MB），SpecHub 的 v1.3 是 1.14 MB。
SpecHub 那一側的大小來自 Storage（`lib/website/baseline.ts`）；
`current_versions` 裡從 Drive 偵測到的舊版號沒有檔案可比，就不判 diff。

版本以**後台版本欄位優先、檔名其次**（跟 skill 一樣：產品頁 Downloads 表顯示的是欄位，客戶看到的是它）；
兩者不一致會另外列成問題。語言則是**檔名優先**（欄位常填錯）。

## 型號與版號的兩條細節（`lib/website/parse.ts`，有測試）

1. **連字號型號**：`ECW201L-POE` 本身是型號時，不再把 `ECW201L` 也算進去，否則它自己的 datasheet 會被判成系列
2. **硬體版本**：`EWS357APv3_…pdf` 的 `v3` 是第三版硬體，不是 datasheet 版號。五個正式站實際會踩到的只有
   EWS2910Pv2、EWS357APv3、ENH500v3 三種檔名；沒有「型號直接接版號」（ECW536v1.3）的檔名

2026-09-16 起線下 skill（`wp-ds-check`，`wp-ds-upload` / `wp-launch-check` 共用它的 `file_version`）也改成同一套規則。

## 讀取策略（`lib/website/check.ts`）

- **產品清單**（`product_model` 兩頁 ACF）是最慢的一步 → `sharedCatalog()` 在同一個 warm instance
  **共用 10 分鐘**，存 promise 不存值（pitfall #75）。**檔案從不快取**，剛上傳的下一次查詢就看得到；
  新建的產品頁最多晚 10 分鐘出現
- **依型號**（`checkModel`）：每站每環境 = 產品清單 + 產品頁的檔案 + **搜尋沒掛上產品頁的 datasheet**
- **依站台**（`querySites`）：批次讀，**先依世代篩再抓檔案**（wireless 116 款 → Wi-Fi 6 只剩 26 款）；
  **不做**沒掛上產品頁的搜尋（那是每個型號一次，會乘上整類的數量）→ **所以結果不存**，免得蓋掉產品頁那份較完整的結果
- **類別要從站上讀**：站上叫 `wireless/indoor-access-points`，不是 skill 範例寫的 `access-point`。
  `/api/website/categories` 順便把兩個環境的產品清單讀進快取，所以選完站按查詢會比較快
- Wi-Fi 世代：`technology_type` 欄位 → 名稱（Cloud6、Fit7）→ 頁面文字。
  產品清單不含規格文字，**沒填欄位的舊款 AP 看不出世代，會列成「沒有列入」**，不猜

## 資料表

`website_checks`（migration 00061）：每個 **(型號, 站台)** 一列上次結果（`verdict` + 當時的 `baseline`）。
一站一列是因為產品頁五站並行查、各自寫入。RLS 開、沒有 policy，只有 `website_check.view` 的 API 用 service role 讀寫。
`baseline` 留著是為了發現「查詢之後 SpecHub 又出了新版本」。

## 1b：可上架標記、每日檢查、Telegram 提醒（2026-09-16）

**流程**：行銷產完 PDF → 產品頁「官網」分頁把那個語言版本標「可上架」→ 每個工作日 09:30 檢查 →
行銷群組收到待上架、推送的小群組收到可以推的站 → 推送後隔天看到正式站跟上，就算上線、記下推送日期。

### 標記（`website_marks`，migration 00062；`lib/website/marks.ts`）

- **一個產品一個語言一列**：`decision` = `ready`（可上架）或 `skip`（不上架），附上**當時的版本和那份 PDF 的 generated_at**
- **標記一律是那個語言「現在的最新版」**（`applyMarks` 自己讀 `current_versions`），而且**只能標 SpecHub 產生的版本**
  （從 Drive 偵測到的版號沒有 PDF，會回 422）。`website_check.mark`（admin / editor）
- **比對基準改成標記的版本**：`loadBaseline(…, targets)` / `targetsFromMarks()`。沒標記的語言照舊跟最新版比，
  產品頁顯示「未標記 · 不會提醒」。手動查詢（`POST /api/website/check`）和每日檢查用同一套，兩邊不會打架
- **v1.4 產了但沒標記**時，`ready` 的 v1.3 照樣追蹤；`skip` 只對它標的那一版有效
- **重產已標記的版本**：`components/website/regenerate-guard.tsx` 在產品頁和預覽工具列的 Regenerate 前先問，
  列出這一版在各站的狀況，提供「改出新版本」。**標記保留**（通常是修正），重產後站上舊檔靠檔案大小抓出來
  → 行銷提醒的「站上是舊檔」會標「標記後重產過」

### 誰該處理（`lib/website/reminders.ts`，純函式有測試）

- **每個站只吃一種語言**（`siteLanguage`：EU/APAC/IN 英文、JP 日文、TW 繁中，沒有繁中版時 TW 看英文），
  所以一個語言版本對到固定幾站、每站剛好出現一次 → 產品頁是「語言版本 → 上架的站台」一個區塊
- `stageOf`：`ok`/`newer` = 已上線；`push` = 等推送的人；`todo` = 行銷上傳；`diff`/`prodnewer`/`mismatch`/`wrong_model` = 要先處理；
  `nopage` = 那站沒有產品頁、不追蹤；`fail` / 沒查過 = 不知道
- **語言各自判**：`SiteVerdict.languages`（1b 加的欄位）。之前存的結果沒有這欄，`languageVerdict()` 會退回用 `missing` / `rows` 推
- **產品頁分頁上的數字** = 標記版本需要處理的站數（`countTodo`，跟分頁頂端「N 件事要處理」同一個數）

### 每日檢查（`/api/cron/website-check`，`lib/website/daily.ts`）

- Vercel Cron `30 1 * * 1-5`（台灣週一到週五 09:30），`requireCron`；`?dry=1` 只讀不寫、不發 Telegram，回傳兩則訊息全文
- **一次批次讀全部產品頁**（`querySites(SITE_CODES, { category: "all" })`，跟依站台同一套），實測 5 站 245 款約 45 秒；
  SpecHub 有的型號結果寫回 `website_checks`（產品頁和追蹤頁打開就是今天早上的狀態）。**批次讀不搜沒掛在產品頁的檔案**，
  所以「已上傳但沒顯示」只有手動查詢會列
- **推送偵測**（`lib/website/site-state.ts` + `nextPushState`）：正式站只會被測試站覆寫，所以**正式站最新內容
  （file、product_model 的 `modified`）往前跳 = 推過一次**，日期取「上次檢查」和「新內容時間」較晚者，顯示「約 9/15」；
  還沒看過跳動前只是下限，顯示「9/11 之後」。存在 `website_site_state`
- **待推送清單**：測試站上 `modified` 晚於正式站最新內容的已發佈 datasheet（包含沒標記、不在 SpecHub 的）。
  ⚠️ **`modified_after` 在這些站不理 `dates_are_gmt`**（實測回傳比 cutoff 早的檔），所以提前一天查、自己比 GMT 欄位
- **推送前先處理**：所有型號（不只標記的）任一語言是 `prodnewer`，因為推送會蓋掉每一台
- 心跳 `website-check`，健康檢查容許 74 小時（週五 09:30 到週一 10:00 是 72.5 小時）

### Telegram（`sendTelegramHtml`，HTML 格式）

- **推送提醒** → `TELEGRAM_WEBSITE_PUSH_CHAT_ID`（小群組：推送的同事 + Terrel）。那位同事不用 SpecHub，**訊息要自足、不放登入連結**：
  先列「推 X 之前先等一下」，再列每站會上線的 datasheet 和等了幾天、上次推送日期
- **行銷提醒** → `TELEGRAM_WEBSITE_MKT_CHAT_ID`（行銷群組）：先補傳到測試站 → 還沒上測試站（標記後幾天）→ 站上是舊檔 →
  資料問題 → 「另有 N 份最新版超過 7 天沒標記」→ 上架追蹤連結（`VERCEL_PROJECT_PRODUCTION_URL/website?tab=tracking`）
- **有待辦才發**；chat id 沒設就記成 skipped，不算失敗

### 上架追蹤（`/website?tab=tracking`，`GET /api/website/tracking`）

- 各站：要行銷處理幾件、待推送幾件（整站，含沒標記的）、上次推送
- 追蹤中的版本：預設只看未完成（全部站已上線或沒有產品頁才算完成；完成的仍每天檢查，站上被換掉會重新出現）
- **還沒標記的最新版本**（`unmarkedLatest`）：Active 產品、SpecHub 產生、超過 7 天、那一版沒有任何標記。
  「站上現況」讀存下來的檢查（`describeSites`），站上已經是這一版的顯示綠字，可以勾選多份一次標記

### 上線前要做的

- 套用 migration 00062（兩張新表，不動既有資料）
- 建兩個 Telegram 群組、把 `@engenius_ds_bot` 加進去，用 `getUpdates` 拿 chat id，設到 Vercel Production
- ⚠️ **SpecHub 的 proxy 在 2026-09-16 之前沒放行 `/api/cron/*`**：`/api/cron/health` 一直被導到登入頁，
  健康檢查**從來沒跑過**（`job_heartbeats` 沒有 `health` 列）。1b 的 PR 把 `/api/cron` 加進 `SERVICE_PATHS`，
  上線後健康檢查才第一次跑，可能會先報 `reindex-web` 從沒回報過

## 還沒做

- 上傳者目前只有 WordPress user id，要換成名字要多查 users
