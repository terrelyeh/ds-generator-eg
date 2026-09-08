# Brand & Visual System — datasheet 的部分

CLAUDE.md 的 Brand 段落只留「改任何 UI 都要知道」的顏色、字體、可調範圍。
這裡是**只有動 datasheet PDF 才需要**的機制：型級規範頁怎麼產、CJK 快照怎麼防漂移、
logo 怎麼換、Cloud 封面的置中是綁在哪一顆圖示上。

- **PDF 版型與字級規範**（四種版型的字型／字級／顏色／logo 對照，字級以真實 pt 排出）：
  站內 `/design/datasheet-type-spec.html`，Settings 有卡片連過去。
  ⚠️ **這一頁是全站唯一免登入的頁面**（`proxy.ts` 的 `PUBLIC_EXACT_PATHS`，精確比對不是前綴），
  給沒有 SpecHub 帳號的外部設計師看。裡面有產品線名稱與機種數量，改內容時要意識到它是公開的；
  已加 `noindex` 不進搜尋引擎。往 `public/design/` 丟新檔案**不會**自動變公開，要另外加進白名單。
  **那份 HTML 是產生出來的，不要手改** —— 改 `scripts/design/type-spec.template.html`
  或 `build-type-spec.py`，然後跑 `python3 apps/spechub/scripts/design/build-type-spec.py`
  重新產生（會同時輸出站內版與 Artifact 版）。Roboto／Manrope 字檔已存在 script 旁邊，
  建置不需要網路。
  ⚠️ **頁面上的字級/字重不是手打的,是 build 時解析出來的**（`read_type_system.py`）:
  `scale.ts` 給刻度、四個版型元件給「哪個角色用哪一階」、`typography.ts` 給版型 A 的
  en 預設。**元件用了刻度外的字級,產生器會拒絕產出並指名是誰。**
  改完刻度只要重跑產生器,不用去改任何數字。
  ⚠️ **唯一的例外是 CJK 那張表** —— ja/zh-TW 的值在 `app_settings`,由設定頁編輯,
  程式碼裡沒有東西可讀。作法是「簽入快照 + 漂移偵測」:
  `python3 apps/spechub/scripts/design/check-cjk-typography.py`(比對快照與線上 DB,
  不一致 exit 1),`--update` 重抓快照後要再跑一次產生器。
  **設定頁改值不會經過任何發版,所以這張表是全頁最容易悄悄過期的地方。**
  （產生器本身在重生時也會非阻斷地跑這個比對,漂移就印警告、連不到 DB 就跳過。）
- **Datasheet logo**（2026-08-13 換新 ®）：`public/logo/` 的 `EnGenius-Logo-white.png`（封面）
  與 `-gray.png`（頁尾,現為近黑 #363333）是從 checked-in 的來源 SVG（`-white`/`-black`/`-blue.svg`）
  **高解析轉出**的。**不要手改 PNG，要改 logo 就改 SVG 再轉**。
  ⚠️ Chrome 會擋 `file://` 的 `<img src>`（轉出來會是破圖 icon）——轉檔要把 SVG markup **內嵌**進頁面,
  不能走 `<img src=file://…>`。這兩個 PNG 被四種版型的封面+頁尾、兩個 app 標頭、規範頁共用,
  **換檔即全站生效**。
- **Cloud 封面標題以雲朵 logo 為基準垂直置中**（2026-08-13）：副標+主標包在一個
  `.cloud-title` 容器,`top: 177.8pt; translateY(-50%)` 置中在 `.cloud-icon` 中心,
  所以主標 1/2/3 行與 CJK 都一致置中（舊版寫死 top 138/160 只對 2 行）。
  ⚠️ **177.8pt = cloud-icon top(142) + 渲染高(85pt 寬 →71.6pt)/2,綁死 `engenius_cloud_icon.png`**
  —— 換那顆圖示要重量。只作用在 `isCloud` 封面;非 Cloud（Transceiver/Unmanaged/Station）
  標題整排靠左、無 logo,不受影響。

- **規範頁的顏色是手抄的，字級字重不是**（2026-09-08）：產生器把每個尺寸和字重
  從 `scale.ts` 與四個版型元件**讀出來**，所以那些數字不可能過期。**顏色不同**——
  `build-type-spec.py` 裡的 `DCN, DCB, DCY`、`--teal` 那幾行、以及比較表的
  「分類列底」那一列都是人手寫的字面值。
  **改版型顏色時要一起改它並重跑產生器，否則站上那頁會靜靜地繼續顯示舊色。**
  `check:guide-layouts` 抓不到——那支護欄比對的是**標案** `PROJECT_LAYOUTS`
  與 `tender-datasheets.html`，跟目錄版型的顏色是兩套（刻意不共用，見
  `project-datasheet/themes.ts` 的檔頭）。目前沒有任何護欄看著這個漂移。
- **B/D 封面 scrim 的定義在 `lib/datasheet/cover-photo.ts`**（2026-09-08）：
  兩支版型元件和上傳檢查器 import 同一個字串。分開寫的話，檢查器會在第一次有人
  動漸層時變成「看起來很合理的謊言」。
  **下限由壓在照片上的最小字級決定**，不是逐張調參：B 有 10pt 內文（4.5:1）→ 0.72，
  D 最小 17pt 屬大字（3:1）→ 0.52。若 B 的內文哪天移出照片，它的下限應該跟著降。
  底色是深藍 `rgb(6,34,58)` 而非純黑——純黑在這個不透明度會變成死灰、把照片壓平。
