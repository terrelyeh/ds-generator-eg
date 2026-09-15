# 官網 Datasheet 查詢（website datasheet check）

> 2026-09-15 建（branch `feat/website-datasheet-check`）。**動 `lib/website/`、`/api/website/*`、
> 產品頁「官網」分頁或 `/website` 之前先讀這份。**

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
  ⚠️ **2026-09-15 只加到 Vercel Preview（限這個 branch）**，merge 前 Production 要補
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

## 跟 skill 刻意不同的兩處（`lib/website/parse.ts`，有測試）

1. **連字號型號**：`ECW201L-POE` 本身是型號時，不再把 `ECW201L` 也算進去。skill 會把它自己的 datasheet 判成系列
2. **硬體版本**：`EWS357APv3_…pdf` 的 `v3` 是第三版硬體，不是 datasheet 版號（EU 真實資料抓到的）

skill 若要一致，這兩處要回頭改 skill。

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

## 還沒做（1b）

- 「可上架」標記（版本列），提醒只追蹤標記過的版本
- 每日檢查 + Telegram：**推送提醒發小群組（推送的同事 + Terrel），訊息要自足、不放要登入的連結**；
  上架提醒發行銷。現有通知只有一個 `TELEGRAM_CHAT_ID`，要另開一個
- 記錄各站推送時間（正式站整批變成跟測試站一樣的那天）
- 上傳者目前只有 WordPress user id，要換成名字要多查 users
