# Project Datasheet Builder — 專案／標案 datasheet（on-demand）

> **必讀時機**：要動 `/projects`、`/preview/project/*`、`project_datasheet*` 表，
> 或想把 project datasheet 的東西接進目錄（products / sync / RAG）之前。

## 這是什麼

Project business = 客戶要客製或還不存在的硬體。拿到 ODM／他牌規格表 →
換成 EnGenius 命名、照片、版型 → 出一份能拿去談 tender 的 PDF。

**這份文件是業務文件，不是產品文件。**

## 最重要的一條：它是平行孤島

| | 目錄 datasheet | Project datasheet |
|---|---|---|
| 來源 | Google Sheets（PM 維護） | 上傳的 ODM PDF / XLSX / 貼上的文字 |
| 產品 | 真的存在 | 可能永遠不存在 |
| 份數 | 一型號一份 | 一型號 × N 個客戶 = N 份 |
| 壽命 | 長期維護 | 談完就封存 |
| 進 RAG | 要 | **絕對不能** |

最後一條是硬底線：**一台只是報過價的 EOR200 如果進了 `products`，
EnGenie 就會開始跟人說 EnGenius 有賣它。** 所以隔離不是靠紀律，是靠結構——
`/api/sync` 和 EnGenie 的 ingest 都只讀 `products`，看不到這裡任何東西。

**沒有「升格成正式產品」的路徑，這是刻意的。** 客戶確定要了，PM 照
[product-line-onboarding.md](product-line-onboarding.md) 在 Google Sheets 重新建線。
一個 promote 按鈕會誘使人把標案資料當成真資料用，而那正是這整套隔離要防的事。

## raw_doc ⊕ rules

```
raw_doc（抽取結果，不可變）  ⊕  rules（所有人為修改）  =  最終規格表
```

**最終規格表不存**，每次 render 重算（`lib/project-datasheet/resolve.ts`）。
這才能讓「換更準的模型重抽」「原廠出 V1.1」「複製給下一個客戶」都不破壞你調過的東西。
真正不可變的紀錄是印出來的那份 PDF。

規則有兩層，model 層疊在 doc 層上面：

- **`project_datasheets.doc_rules`** — 對整份文件的要求（「不要放 chipset」「是 IP67」）。
  業務的 spec note 就是長這樣，存在 model 上就會變成「EOR100 藏了、EOR200 忘了藏」。
- **`project_datasheet_models.rules`** — 這一欄自己的（值本來就 per model）。

衝突時 model 贏，**但 `hide` 是聯集**——doc 層藏掉的，model 層不能放回來。

規則語法（編輯器與 `text-format.ts`）：

```
- cpu                       隱藏
ingress_protection = IP67   覆寫；來源沒這列也會憑空長出來
~ power_consumption = PoE   改標籤
+ Power over Ethernet = 802.3at   新增一列
? antenna = na              這格空的時候印什麼（tbd | na | blank）
## software                 之後的列歸到 Software Features 表
```

列的順序是**合併**各欄、不是串接：每一欄保持自己的相對順序，只有某一欄有的列會插在
它在那一欄的鄰居旁邊。這不是美觀問題——串接會把所有 5G 專屬的列丟到 Weight 底下，
讓「區分這兩台的那個規格」讀起來像附註。

`key` 是 label 正規化後的字串（`normalizeKey`）。重抽之後 label 改名或消失，
規則就變成**孤兒**——編輯器會列出來，不會默默吃掉。**一個悄悄失效的 override
就是 chipset 重新出現在標案文件上的方式。**

## 三個目錄版型沒有的東西

都是「印一個還不存在的產品」直接推出來的：

1. **PRELIMINARY 聲明關不掉**（DB `not null` + non-blank check）。
   **文字可編、存在與否不可編。** 印在封面（不只頁尾——封面才是會被截圖轉寄的那頁）。
2. **區塊開關**（`sections`）。報價階段根本還沒有包裝，印一個空的 Package Contents
   看起來像漏做，不像流程中的一步。
3. **TBD / — 佔位**（`blank_policy` + 逐格 `? key = mode`）。「ODM 還沒回」是這個
   階段規格表的正常狀態，不是錯誤。整列都空才會整列消失。

還有一個對稱的：**圖片註記**（`image_note`）。專案 datasheet 常常放一張「像的那台」
的照片，標案文件放一張不是本人的照片而不說明，是誤導風險。有圖就有註記。

## 版型是選的，不是推導的

目錄版型看產品是什麼（`getTheme()` 依 category 切）——Cloud AP 就是藍的，沒人要選。
Project datasheet 相反：產品還沒有線，配色是**每個案子自己挑**，所以 `layout` 是
一個存起來的欄位，查 `lib/project-datasheet/themes.ts` 的 `PROJECT_LAYOUTS`。

- 加一個配色 = 加一筆 entry
- 加一個真的不同的**版型** = 加 entry + 加元件（`component` 欄位指到哪支渲染）

⚠️ **那些色值是「抄自」目錄版型，不是「共用」。** 如果直接 import
`broadband-preview.tsx` 的顏色，總有一天一個一次性標案的調色會回頭改到出貨中的
EOC datasheet。這裡分岔很便宜，耦合出事很貴。

同理，**`project-preview.tsx` 是獨立元件，不是 `broadband-preview.tsx` 加參數**。
共用的是版面語彙（`scale.ts` 的字級刻度、`bullet.ts`、`typography.ts`），
所以出來的東西仍然讀起來是 EnGenius 文件。

⚠️ 這支元件**不在** `scripts/design/read_type_system.py` 的 `COMPONENTS` 清單裡，
所以不會出現在公開的
[type-spec 頁](https://…/design/datasheet-type-spec.html)。**不要加進去**——那頁是
免登入的，上面有產品線名稱與機種數量，標案版型不該在那裡。

## Gap review — 引導層

這個模組不是「一次把 datasheet 生對」的轉換器。業務手上的資訊永遠不完整，
假裝完整只是把缺的東西從「不知道」變成「悄悄假設了」。工具的工作是**一直問到補齊**。

`lib/project-datasheet/gap-scan.ts` 讀現況，產出三類 finding：

| 類 | 意思 | 例子 |
|---|---|---|
| **缺** missing | 還沒拿到 | TBD 格、沒圖、沒 overview |
| **疑** doubt | 跟來源不一致 | 覆寫改了數值、值不是來源給的、兩台該一致卻不一致 |
| **險** risk | 會出錯 | af 餵不動 24 W、藏了 chipset 但文字裡還有型號 |

**掃描是 deterministic 的，沒有 LLM。** 同一份文件永遠得到同一組 finding，
finding 才能跨次掃描追蹤，也才不會有人懷疑「沒警告是真的沒事，還是模型沒看到」。
LLM 屬於 intake（把業務的一段話變成規則＋問題），不屬於這裡。

### blocking vs advisory 的分界不是「缺多少」

```
advisory = 文件還不完整   ← preliminary 本來就這樣，TBD 是誠實
blocking = 文件會寫錯     ← 自己填的數字、自我矛盾的規格、說要拿掉卻還在的字
```

所以「14 格 TBD」不擋，「IP67 沒有來源」擋。`status` 要切到 `ready`
**會被 API 擋下來**（409 + 列出擋住的項目）——不然引導只是建議，而對一份已經寄出去的
文件提建議毫無意義。

### finding 是算出來的，questions 表只存「人做了什麼」

跟 `raw_doc ⊕ rules` 同一個道理。表以 `(code, model_id, row_key)` 為身分，
每次掃描**對帳**而不是重建：新的插進來、消失的標 `resolved`（不刪，因為
「當初問了什麼、怎麼定案」就是日後守住規格承諾的依據）、又出現的重新打開。
**severity 不存**——存了就會有規則改嚴之後，舊資料還帶著舊 severity 的鬼問題。

### 澄清訊息才是產出

能回答這些問題的人**都不在 SpecHub 裡**：業務在通訊軟體上、RD 在會議室、
ODM 在另一個時區的 email。一個只有作者看得到的漂亮清單補不了任何洞。

所以 `brief.ts` 產生一段**可以直接貼出去的 zh-TW 文字**，按「誰能回答」分組
（RD / ODM / 業務 / 我方）。是**模板不是 LLM**：問供應商的問題每次都該長一樣，
沒有人想 diff 兩個 LLM 版本的「幾根天線」。同一個 check 重複太多次會摺成一條
（一邊七個「沒有值」摺成一則，可以一次回完）。

**記錄答覆不會自動改規格表。** 把答案變成規則是另一個刻意的動作——
一個會偷偷改寫規格表的答案欄，會是整個模組裡最難稽核的東西。

## PDF 怎麼出

**瀏覽器列印**（`ProjectPrintToolbar`），不是 `/api/generate-pdf`。
後者會寫 version、把檔案放進 `datasheets` bucket、幫產品線開 Drive 資料夾——
每一件都是標案草稿不該有的目錄副作用。瀏覽器列印的爆炸半徑就是使用者自己電腦上的一個檔案，
對一份可能永遠不會寄出去的文件來說這是對的。

## 權限

`project_datasheet.view` / `.edit` → **只有 admin / editor**。

比 battlecard 還窄，是刻意的：每份 project datasheet 都是一場對話的產物，
由正在談的那個人（MKT）寫，不是靠審核流生出來的。PM 不在是因為根本沒有審核流；
viewer（業務／field）不在是因為一份看起來像 datasheet 的半成品正是你不想讓它在外面流傳的檔案
——交出去的是那份完成的 PDF。

## 檔案地圖

```
packages/db/supabase/migrations/00038_project_datasheets.sql   3 張表 + bucket + RLS
src/lib/project-datasheet/
  types.ts        jsonb 欄位的真實形狀
  resolve.ts      raw ⊕ rules → 矩陣（含孤兒規則偵測）
  themes.ts       PROJECT_LAYOUTS registry + 預設聲明文字
  text-format.ts  純文字 ⇄ jsonb（編輯器用的貼上格式）
src/app/(main)/projects/                列表 + 編輯器
src/app/(print)/preview/project/[id]/   渲染
src/app/api/projects/                   CRUD（admin client 寫，gate() 授權）
src/components/project/                 編輯器 UI
scripts/seed-project-eor.ts             EOR100/EOR200 pilot（--reset 重建）
```

## 現況（2026-08-20）

**M1 完成**：資料層、手動建案、規則解析、渲染、出 PDF（含標準 footer + Contact Us QR）、
區塊開關、TBD 佔位、PRELIMINARY + 圖片註記、版型 registry。

**M2 完成**：gap review（缺／疑／險三類掃描）、questions 表對帳、澄清訊息、
readiness gate。跑 EOR 這份的結果是 22 項（7 blocking）。

**還沒做**：
- **M2.5 intake** — 業務給的一段需求（「不要放 WiFi / poe 是 802.3af/at / IP67」）
  → 拆成「可執行的規則」+「答不出來的問題」。這是引導迴圈的前門，也是唯一該用 LLM 的地方
- **答案 → 規則** — 現在記錄答覆只留文字，套用還是手動改欄位
- **M3 抽取** — PDF（Vercel 上沒有 poppler，要用 JS 的 `unpdf`/`pdf-parse`，這是第一個要驗的技術點）、
  XLSX（sheetjs）、貼上文字；LLM 只做結構化不做改寫，逐格帶 `source_page` + `confidence`。
  抽進來之後**來源全文也要進殘留掃描**——現在只掃得到規格列，
  掃不到 overview 原文裡的 "based on the new SDX62 platform"
- **M4** — Duplicate（複製給下一個客戶）、封存
- **自由排序** — 目前的順序是「合併各欄、各欄保持自己的相對順序」＋ `add.after`
  指定新列位置。這個組合對 EOR 這種案子已經對了（5G NR 排到最上面跟其他射頻規格一起、
  Antenna gain 落在 Dimensions 旁邊、PoE 落在 Interface 後面），但沒有「把這列拖到那裡」
- 圖片上傳（現在只吃 URL）
