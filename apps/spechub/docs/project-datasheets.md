# Tender Datasheets — 標案 datasheet（on-demand）

> **必讀時機**：要動 `/projects`、`/preview/project/*`、`project_datasheet*` 表，
> 或想把這裡的東西接進目錄（products / sync / RAG）之前。
>
> ⚠️ **2026-08-21 改名**：畫面上叫 **Tender Datasheets（標案 Datasheet）**，
> 原本叫「Project Datasheet Builder」。**網址 `/projects`、權限 key
> `project_datasheet.*`、資料表名稱全部沒動**——那些是跟書籤／角色矩陣／DB 的契約。
> 程式碼裡看到 `project` 不是舊名殘留。

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

### 圖片：第二個 bucket，而且是 public

`project-datasheets`（00038）是**私有**的，裝的是**證據**——規格從哪份 ODM PDF 來的。
產品照片是相反性質的東西：它會**印在交給客戶的文件上**，而 renderer 是用一個普通的
`<img src>` 去拿——列印時從作者的瀏覽器、之後做 server-side PDF 時從 headless Chrome。

- **signed URL 會過期**，幾個月後把一份已經寄出的 datasheet 變成一排破圖
- **走驗證過的 proxy route** 在瀏覽器可以，在 Puppeteer 不行（它沒有 session）

所以：**圖片 public、來源 private**（`project-images`，migration 00043）。
跟目錄那邊同一個切法——`datasheets` bucket 本來就是 public 在放產品圖。

⚠️ public = 拿到網址的人都讀得到。對 EnGenius 硬體 render 沒問題，對別的東西就不對了，
所以上傳端**只收圖片格式**。

⚠️ **`images` 不在 Save 的送出欄位裡。** 上傳當下就寫進去了，
Save 如果順手把表單掛載時的那份副本送上去，會把之後所有上傳蓋掉。

### 封面高度是彈性的，不是寫死的

戶外機的 render 又高又窄，寫死 `max-height` 會錯兩次：對這種比例太小
（高度先撞到上限，寬度還有一大截沒用到，封面空掉三分之一），
而某人寫了四段 overview 的時候又太大。所以 `.cover-body` 是一個
從 header 底下到 PRELIMINARY 條上方的固定框，圖片吃掉文案沒用完的部分。

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

## 這個模組真正在做的事：sourcing

EnGenius 沒有的產品線 → 去 sourcing → 拿到廠商的 datasheet →
**暫時掛上我們的品牌** → 拿去 approach 不同的專案。

來源那份**大致符合**客戶需求，不是完全符合。所以我們在上面加的東西，
是**客戶真正的需求跟廠商現況之間的差距**。

⚠️ **所以 `rules` 不是「我們對規格表的修飾」，是「拿到案子後要請 ODM 改的硬體變更清單」。**
掃描器的措辭跟著這個框架走：問的不是「這數字哪來的」，而是
**「ODM 做不做得到、多少錢」**。它仍然會擋——因為在對方點頭之前，
那個數字印在客戶手上就是一個承諾。

（既有型號帶入的那條路是例外，措辭不變——我們自己在賣的機種沒有 ODM 可以問。）

**命名類的列**（Description / Model / Series…）不算硬體，只給 advisory：
沒有人會叫工廠生產一個 Description。

### 還沒做：ODM 硬體變更需求書

資料已經齊了（逐格知道 來源／改過／新增），可以直接算出
「廠商現在是什麼 → 我們要什麼」，產出一份寄給 ODM 的文字，
跟澄清訊息同一個模式。**等真的拿到案子要發給 ODM 時再做**（2026-08-20 決定）。

## 兩種起點

**① ODM／他牌規格表**（原始 use case）——客戶要客製或還不存在的硬體。

**② 我們自己已經在賣的型號**（更常見）——標案要的是我們現成的產品，
但要的細節比公開 datasheet 多。我們的 datasheet 是寫給買方看的，
會刻意省掉標案在評分的深度技術規格。所以流程是「拿真的那份，補它沒寫的」，
不是「重打四十列」。

`/api/projects/[id]/seed-from-product` 把 `products` → `spec_sections` →
`spec_items` 攤平成 `raw_doc`，連文案與產品圖一起帶。
label 只在**重複時**才加上 section 前綴（實測 ECW536：6 個 section → 45 列、零重複 key）。

⚠️ **只有目錄 → 專案這個方向。** 反向永遠不會開（見 00038）：報價不能變成產品紀錄。
這條路徑只讀 `products`，不寫。

### 為什麼要獨立的 `kind='catalog'`

因為 gap review 對它的兩個判斷**方向相反**：

| | ODM 規格表 | 既有型號 |
|---|---|---|
| 補一個來源沒有的規格 | 我們自己編了一個數字 → **blocking** | **正是這份文件的用途** → advisory |
| 改一個來源有的值 | 在定義一個還不存在的產品 | **跟公開的 datasheet 打架** → blocking `catalog_deviation` |

第二列是這個模組最尖銳的一條 finding：**那台在出貨，客戶可以把公開的 datasheet
拿來並排比對。** 沒有這個區分，review 不是擋住正常流程，就是放掉唯一真的會被抓包的事。

## Intake — 業務需求進來的地方

業務給的從來不是規格，是幾行中英夾雜的字，裡面混著**能執行的指令**（「不要放 chipset」）
和**只有人能決定的事**（「圖片是 EnGenius model」——哪一台？哪張圖？）。

`lib/project-datasheet/intake.ts` 把前者變成建議規則、後者變成待問問題，**然後停下來。**

### 只建議，不套用

解析完什麼都沒動。每一項都帶著它出自哪一行（`because`），人一項一項勾。
跟這個模組其他地方同一個姿勢：抽取只建議、raw 不可變、記錄答覆不改規格表。
**一個會偷偷改寫報價文件規則的 LLM，會是整個工具裡最難稽核的東西。**

### 兩個真的會出事的地方

**① 覆寫會蓋掉整格。** 第一版跑真實需求時，模型把「poe 是 802.3af/at」
變成 `doc_override interface = "PoE: 802.3af/at"` ——那會**把 LAN port、reset、
SIM slot 整格刪掉**，而且在建議清單上讀起來完全合理。

兩層修法：prompt 明講「新規格就開新列，不要塞進相關的列」，
**而且 API 會算出每一項「會蓋掉什麼」**（`annotateReplacements`）顯示在卡片上，
**這種項目預設不勾**。prompt 會改善，review 才擋得住。

**② 不確定就問，不要猜。** prompt 裡最難的一條。工具在報價文件裡默默把模糊變確定，
就是把「業務沒講」變成「datasheet 說了」——那正是 gap review 存在的理由。

### 需求note是 source 不是設定

存進 `project_datasheet_sources`，`kind='requirements'`（跟 `'text'` 分開:
`text` 是貼進來的**規格內容**，會被抽成 `raw_doc`;`requirements` 是**對文件的指令**）。
`extraction` 存解析結果 + 誰被勾選套用——規則合併之後就回不去的那個資訊。

## 抽取 — 來源進來的地方

`lib/project-datasheet/extract.ts`。三種輸入（PDF / XLSX / 貼文字）先各自轉成
**頁文字**，之後只有一種格式要處理，新增一種輸入只要多一個 reader。

### 原文照抄，不做好心的整理

單位不換、全形不轉、`＜24W（POE 48V/0.6A）` 就是原封不動進來。
**每一個「整理」都是人為修改，屬於 `rules`**——放在那裡才會在 gap review 上
顯示成「某人改了什麼」。`raw_doc` 保持不可變的意義就是它要能跟客戶哪天拿出來的
那份 PDF 對得起來。

實測（EOR 那兩份 WPS PDF）：4G 4 頁 → 15 列，5G 7 頁 → 45 列，
group（spec / software / package）全對、頁碼全對，
連來源自己把 DDNS 打成 `DNNS` 都照抄並在 notes 裡提了一句。

### 套件選擇

- **PDF：`unpdf`**。Vercel 上**沒有 poppler**，所以不能用 `pdftotext`。
  unpdf 是純 JS、serverless 友善。沒有文字層（掃描檔）會**明講讀不到**，
  不會安靜回一個空的。
- **XLSX：`exceljs`，不是 `xlsx`**。npm 上的 `xlsx` 最新版（0.18.5）
  仍帶著兩個未修的 advisory（prototype pollution + ReDoS）**而且就在 parser 裡**——
  那正是上傳的原廠檔案會經過的路徑。exceljs 只有一個 transitive `uuid` 的
  moderate，不在我們的路徑上。
- **不做 OCR**。這些 ODM 檔都是 WPS 匯出、文字層乾淨。對一份自己就帶文字的文件
  動用視覺模型，比較慢、比較貴、也比較不準。

### 套用是「取代」不是「合併」

`raw_doc` 是**一份來源的一次讀取**。合併兩次讀取會得到一份跟哪一份 PDF 都對不起來的文件。
所以套用前的預覽會先講清楚代價：**會取代幾列**，以及**哪些規則會失去對象**
（`findOrphanedRules`）。規則不會消失，只是靜靜不生效——而那正是這個模組要吵出來的失敗模式。

### 來源原文會餵進殘留掃描

供應商有一堆規格是寫在**敘述段落**裡、從來沒進規格表。5G 那份的 overview 寫
「the waterproof level is up to IP66」，規格表則完全沒提防護等級。

沒有來源原文時，掃描器只能說「IP67 沒有來源」——是實話，但沒什麼用。
有了之後它會說：**「來源的內文寫的是 IP66」**。`unsourced_value` 會換成
`source_prose_conflict`——是**另一個問題**，所以舊的關掉、新的打開是對的行為。

只比對**代碼型**規格（IP 等級、802.3 等級）。像 `-40°C` 在內文有十幾種寫法、
一半還是儲存溫度而不是工作溫度，比對它只會產出很有自信的胡說。

## 起草文案 — 兩個 drafter，一份契約

情境圖旁邊那幾段、以及封面（主標／分類／Overview／Features／架構圖說明），
可以從**這份文件算好的規格表**起草。`scenarios.ts` 和 `cover-copy.ts` 兩支，
共用 `grounding.ts` 的約束——**一份，不是兩份**，因為兩份會往「最後被編輯的那一份」漂。

### 這份契約整套都是否定句

它防的不是笨句子，是**好句子**。這份文件曾經寫過：

> a second carrier stands by, protecting payment when one network degrades

通順、合理、像 datasheet 會講的話，而它描述的是廠商從沒宣稱過的自動切換——
來源只寫 `2 x SIM card slot`。它撐過好幾輪校稿，最後是用手拔掉的。所以：

- 不准講規格表上沒有的數字、頻段、等級、能力
- **也不准講規格「隱含」但沒寫的能力**——兩張 SIM 卡就是兩張 SIM 卡，不是備援；
  DC 輸入不是電池；乙太網孔不是 PoE
- **只有部分型號有值的那一列，就只是那幾台的事**（室內機的段落不能借室外機的 VPN 清單）
- 每一點帶 `basis` = 引用的規格列名。沒有依據的用空字串，**而且提示詞明講「誠實的空白
  比硬拗一個標籤有價值」**——少了那句，模型會拿 `Description` 去掛一句講安裝方式的話，
  正好蓋掉審稿的人唯一需要知道的事
- 撐不起來的說法進 `declined`，說明缺哪一條。**那份清單通常比文案本身有用**——
  它就是要回頭去跟原廠要的東西

### 封面 drafter 刻意不給來源原文

gap-scan **要**讀廠商的敘述文字（抓「來源寫 IP66 你寫 IP67」）。起草是相反的工作：
餵一段寫著「waterproof level is up to IP66」而規格表沒有防水等級的文字進去，
等於請它把廠商的行銷話術洗成我們的——**用我們的語氣、我們的信紙**。
規格表裡本來就有 Description 列說明這是什麼產品，那就夠了。

### 兩支 API 都是唯讀

`scenarios` 和 `cover` 兩支路由**什麼都不寫**，連 intake 會留的 source row 都沒有。
按「填進去」是把文字放進**平常自己打字的那些欄位、不存檔**，還是按原本那顆儲存。
封面是**一格一格填，不做「全部套用」**：主標三個字一眼看得完，Features 是四句各自
要對著規格表讀的話，做成一顆按鈕等於讓主標的輕鬆替賣點的風險背書。

### 從既有型號帶入會直接帶文案，不用 AI

`catalog-copy.ts` 的 `coverPatchFromCatalog()`，**只填空的欄位**——加第二台不能蓋掉
為第一台寫的字。目錄的賣點是平的一串，原樣塞成一個 Key Features 區塊，**不編主題去拆**
（編主題是寫作，寫作是 drafter 的事）。
⚠️ 這裡曾經有個 bug：文案抄進的是**型號那一列**的 overview/features，而封面印的是
文件層——那兩欄只有殘留掃描在讀，features 根本沒人讀。**抄進去然後丟掉。**

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

### 一項規格、兩個名字 → 兩列各半空

`spec-align.ts`。規格列是用 `normalizeKey(label)` 合併的，所以兩家廠商把同一件事叫成
`Operating Temperature` 和 `Enclosure`，就是兩列，每列只有一半有值。
**加進既有型號時更嚴重**——目錄的標籤來自 `spec_items`（`Physical Interfaces`、
`Maximum Power Consumption`），跟廠商 PDF 的叫法幾乎不會對上。

⚠️ **而 `blank_cell` 對這種列會給錯的建議**：「其他型號有值，這幾台沒有，跟 ODM 要」——
值沒有缺，它在另一列。所以 `same_spec_split` 刻意排在 `blank_cell` 後面，兩條並排，
人才學得會分辨。

判斷是**寫死的規則，沒有 LLM**（跟整個 gap review 一致）：

1. **兩列的有值欄位互補**——沒有任何一台同時有這兩列。這條做最多的事，
   也是它敢附一顆按鈕的原因：有重疊就是兩件不同的事，合併會毀掉其中一個。
2. **同義詞表**（`Environment`↔`Operating Temperature`、`Product Size`↔`Dimensions`…），
   而且**同時當拒絕條件**——兩邊都在表裡但屬於不同組就直接不配對，
   這是擋掉「`Power Consumption` 配 `PoE Input`（因為值都以 W 結尾）」的那道防線。
3. **值的形狀**（溫度、尺寸、重量、瓦數、電壓、IP 等級、濕度、PoE 等級、Wi-Fi 標準）。
   這半負責抓沒人想到要列進同義詞表的標籤——`Enclosure` 不在表裡，但它裡面寫著 `-40 ~ +70 °C`。

⚠️ **哪一邊的標籤留下**：目錄型號的贏（那是我們自己公開的用字，客戶可以拿去並排比）；
否則**第一欄的用字贏**。不是「排比較上面的那列」——合併演算法會把後加的欄位獨有的列
排在前面，所以「上面」等於「後加的」，正好相反。第一版就寫錯過。

⚠️ **合併是 `model_hide` + `model_add`**，值**逐字搬過去不改**。重新歸檔一個事實
跟編輯它不是同一件事，順手「整理」一下文字正是這個模組對來源絕不做的事。
`model_hide` 是為此新增的 item 型別——`doc_hide` 會把那個叫法從第三欄也拿走。

⚠️ **plan 在伺服器重算，不收前端傳來的**。配對規則只能有一份。
前端只送「哪一個 finding、哪一個方向」。

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

### 答案 → 規則

記錄答覆時會**先讀一遍答案，提出規格要怎麼跟著改**，走的是跟 intake **完全同一條管線**：
建議 → 顯示會蓋掉什麼 → 勾選 → 套用。一種提案格式、一條 apply 路徑（`apply-items.ts`）、
一個 review 元件（`proposal-list.tsx`）。**答案不會因為晚到就比較可信**，
兩份清單如果長得不一樣，遲早會變成兩種審查標準。

最難的情況是**「不用改」**：doubt 類的答覆多半是確認（「殼體確實照 IP67 做的」），
正確輸出是**什麼都不產出**——問題關掉、值不動。一個覺得自己非得產出編輯的模型，
會把正確的規格改寫成答覆的轉述，那就是 `IP67` 變成 `IP67 (confirmed by RD)`
印在客戶的 datasheet 上的方式。

兩個實測調出來的行為：
- **保留答案給的每個數字與修飾**——「4 根 5 dBi 全向天線」要變成
  `4 × 5 dBi omnidirectional`，掉了「4 根」就是掉了規格
- **一個答覆可以結掉一整族的列**——「EOR100 是 4G 機種，這幾項不適用」
  一次處理掉四個 5G 列（每一項仍然分開勾選）。不然同一句話要打四次

`model_blank` 這個型別存在的理由：**TBD 和 — 是兩件事**，
「還沒回」跟「本來就沒有」只有答案分得出來。

## 複製與封存

**複製給下一個客戶**（`/api/projects/[id]/duplicate`）。什麼帶過、什麼不帶，就是設計本身：

| 帶過 | 為什麼 |
|---|---|
| `raw_doc` + `rules` | 規格工作是最貴的部分，硬體又沒變 |
| **已確認／已忽略的問題** | 「RD 確認殼體是 IP67」是關於**產品**的事實，不是關於這個案子的。下個月拿同一句話再去煩同一個工程師，就是讓人學會直接跳過審查清單的方式 |

| 不帶 | 為什麼 |
|---|---|
| 未回答的問題 | 第一次掃描就會重新產生；帶過去只會留下一堆綁著**舊 model id** 的孤兒 |
| 客戶、備註、內部欄位、status | 全都屬於正在結束的那個案子。留著上一個業務的名字或別的標案的數量，比空白更糟 |
| `disclaimer` | 會**重新產生**（裡面有客戶名） |
| `sources` | 新文件指向同一份規格，但它自己的來源紀錄從今天開始 |

**封存**就是 `status='archived'`，列表會把它收到下面的區塊。

## PDF 怎麼出

**瀏覽器列印**（`ProjectPrintToolbar`），不是 `/api/generate-pdf`。
後者會寫 version、把檔案放進 `datasheets` bucket、幫產品線開 Drive 資料夾——
每一件都是標案草稿不該有的目錄副作用。瀏覽器列印的爆炸半徑就是使用者自己電腦上的一個檔案，
對一份可能永遠不會寄出去的文件來說這是對的。

## 出圖存檔 = 版本控管（migration 00047）

走瀏覽器列印的代價是**系統從來不知道你出過圖**，列表只能顯示 `updated_at`——
而那個東西改一個內部備註就會跳。`project_datasheet_issues` 補上這件事：
**列印按鈕先存一版快照，再開列印對話框**。

⚠️ **快照存的是「算完的結果」**（`{doc, models}`，就是渲染元件的兩個 prop），**不是外鍵**。
規格表是 `raw_doc ⊕ rules` 每次算的，用外鍵做快照 = 別人改一條規則、舊版就跟著變，
而那正好是這張表要防的事。重播 = 把快照原封餵回元件
（`/preview/project/[id]/issue/[issueId]`，那頁**沒有列印列**——它是紀錄，
再印一次會替一份沒人編輯過的文件多記一版）。

⚠️ **⌘P 擋不到。** 所以列表和編輯頁都會標「出圖後又改過」——
一個誠實的過期標記，比一個假裝完整的日期有用。

⚠️ **刪除會 cascade 掉 issues。** 所以列表給兩種動作：**沒出過圖 → 刪除；出過圖 → 封存**，
API 也會以 409 擋（只把按鈕藏起來不算數）。

## 圖上的標籤

一個標籤存**兩組相對圖片框的百分比**：`x,y` = 圓點（指向哪台設備）、`lx,ly` = 文字位置，
中間畫 SVG 引線。編輯器兩個拖曳點，拖圓點時文字跟著走。

⚠️ **固定位移（`side`）解決不了「蓋住設備」** —— 要移多遠取決於設備在圖上被畫多大，
那件事只有眼睛知道。`side` 只留作舊資料 fallback 和快速擺位。

⚠️ **編輯器和列印必須用同一套幾何**，而且**「標籤佔圖的比例」也要一致**。
這裡連續踩過兩次：先是位移（編輯器 9px 對版型 7pt），再來是字級（10px 對 8pt）——
兩次都是「編輯器看起來清空、PDF 還是壓住設備」。現在數字集中在
**`lib/project-datasheet/label-geometry.ts`**（`LABEL_PT` / `LABEL_DOT_PT` /
`SCENARIO_WIDTH_PT`），兩邊都讀同一份；編輯器量出圖片實際渲染寬度換算比例。
**要改字級改那裡，不要各改各的。**

⚠️ **主圖不能用 `object-fit: contain`** —— contain 會 letterbox，
「元素的 50%/50%」不等於「圖片的正中央」。要 `max-height` + 寬度 auto。

⚠️ **標籤跟著圖片走，換圖重傳要重點一次。**

## 新增列的擺位語法

```
+ Description @first = Indoor 4G LTE Cellular Router
+ IP Rating @after Weight = IP67
```

`AddedRow.after` 這個欄位一直都在、`placeAdds()` 也照做，**但文字格式沒開語法**，
所以實務上新增的列永遠排最後——有人只好把 `@model` 打進值裡，印在客戶看的規格表上。

⚠️ 語法放**標籤後面不放值裡**：規格值幾乎什麼字元都可能出現。
⚠️ `@first` 是「**那張表**的最前面」，不是整份文件的——加在 `## software` 底下的列
跳到 index 0 會渲染在規格表標題底下。
⚠️ 序列化會把擺位寫回文字，打過一次之後每次存檔都保得住。

## Application diagram 的版面

**第 2 頁 = 唯一的架構圖，而且是抽象的**：基地台 → 無線鏈路 → 一片乾淨切斷的牆
（代表建築外殼但不說是什麼建築）→ 設備 → 穿牆 → PoE switch → 下游。
**不綁產業**，換案子不用重畫。

**第 6 頁 = 場域頁，一列一個場景**：圖左 58%、文案右邊（小標＋引言＋列點）。
每張都要有那個場域特有的下游設備，不然看起來像漏做。
⚠️ 要 **16:9 不要 21:9**；高度預留 572pt（四列時 590 只剩 12pt 淨空）。
⚠️ **`diagram_title`/`diagram_note` 只屬於第 2 頁**，第 6 頁標題寫死——
兩頁曾經共用同一個欄位，分家後會把「System architecture」印在場域頁上。
**欄位在畫面上叫「架構圖的標題／說明」**（2026-08-24 改名）。它們原本叫「應用情境圖的…」，
是兩頁共用時期的遺留：**欄位分了家、名字沒有**，照名字找的人會跑去第 6 頁。
（同一次也修掉一句假話：標題的提示曾說留空會用預設的「Application Diagram」——
renderer 裡沒有那個預設值，留空就是不印。）
沒有印 Features 頁時，`diagram_note` 會改排在第 6 頁最上面，`diagram_title` 不會。
**這兩格沒有人會自動填**：目錄沒有對應欄位，所以要嘛手打、要嘛按封面 drafter。

## PDF 檔名

`printTitle()`（`lib/project-datasheet/filename.ts`）→
`EOR100-EOR200-Cellular-Routers_PRELIMINARY_2026-08-21`。
原本沒設 page title，所以每份存下來都叫根 layout 的 "Product SpecHub — EnGenius"。

⚠️ **PRELIMINARY 放檔名是刻意的** —— PDF 會被轉寄，檔名是沒有封面也還跟著走的東西。
⚠️ `generateMetadata` 走一般 server client 不走 admin（RLS 擋住不該看到名字的人），
所以**自動化那條是 anon、只拿得到通用標題，headless 驗不到真檔名**。

## 編輯器的資訊層級

四個分頁，照「新建一份文件時實際的填寫順序」排：
**狀態與待辦 → 內部資訊 → 封面與文案 → 規格與型號**。
上面固定一條**下一步**橫幅，由狀態算出來（沒型號 → 叫你加；沒規格 → 叫你讀；
有 blocking → 叫你去問人；都清了 → 叫你標成可以送出）。

在這之前所有面板等權重地往下瀑布流，「我現在該做什麼」的答案是**把十幾個面板讀完自己推**。

- **只有「規格與型號」在最後**，雖然它是每天用最多的分頁——因為建檔順序比使用頻率更能解釋這個工具在幹嘛
- **內部資訊獨立一頁 + 虛線深灰框 + 「不會印出來」標籤**。原本內部欄位跟會印出去的欄位長得一模一樣並排放
- **「最終規格表」放在規格分頁最上面**——先看結果，再看規則
- 未存變更會在標題旁標示（欄位分散在四頁之後，「我改了東西然後跳走」變得看不見了）

### 哪些動作會花 AI 的錢

五個：**解析業務需求**、**記錄答覆**、**上傳原廠 PDF / Excel**、
**起草情境文案**、**起草封面文案**。
**「重新檢查」不用 AI**——gap-scan 全是固定規則比對，按幾次都一樣。
這件事寫在畫面上，因為「會檢查的東西應該會花錢」是很合理的假設，
而這個假設會讓人少按那顆按鈕。

## 內部資訊欄位

`branch` / `sales_owner` / `opportunity` / `tender_date`（migration 00041、00044）。

`deal_stage` 和 `est_quantity` 試用之後**移除了**（00044）：案子階段在 CRM、數量在報價單，
留在這裡只是第二份會過期的副本。**沒人更新的欄位比沒有欄位更糟，因為下一個人會相信它。**
`due_date` 改成 `tender_date` 而且是文字——實際收到的是「2026 Q3」「三月底前」，
日期選擇器會把它硬塞成一個從沒約定過的日子，還把那個修飾語弄丟。

⚠️ **這些永遠不會印。** `project-preview.tsx` 不讀這些欄位，也不該開始讀——
一份指名我方業務、我們內部的案子階段、我們猜客戶會買多少的報價文件，
是根本不該離開公司的東西。

`deal_stage`（案子的狀態）跟 `status`（文件的狀態）**是兩件事**：
文件可以做完寄出去而案子還在談，案子可以輸掉而文件還停在 draft。合成一個會弄丟其中一半。

刻意**沒有**客戶聯絡人姓名／email——SpecHub 不是 CRM，個資放進來只是多一個要守的地方。

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
  gap-scan.ts     缺／疑／險掃描（deterministic、無 LLM）
  spec-align.ts   一項規格兩個名字的配對（同義詞 + 值的形狀，也是 deterministic）
  brief.ts        澄清訊息（模板、zh-TW、按誰能回答分組）
  intake.ts       業務需求 → 建議規則 + 待問問題
  grounding.ts    兩支 drafter 共用的否定契約 + specLines()（規格表 → 提示詞的行）
  scenarios.ts    產業 → 情境小標／引言／列點
  cover-copy.ts   規格表 → 主標／分類／Overview／Features／架構圖說明
  catalog-copy.ts 目錄產品 → 文件層封面文案（只填空的）
  blockers.ts     openBlockers()：扣掉人已回答/略過的，Ready 守門與列印列共用
  label-geometry.ts 編輯器與列印共用的標籤字級/位移（不共用就會兩邊不一樣）
  image-prompt.ts 情境圖提示詞的房規（刻意不從伺服器呼叫圖像模型，理由寫在檔案裡）
  filename.ts     PDF 檔名
  answer.ts       答覆 → 規格改動建議（跟 intake 共用提案格式）
  extract.ts      PDF / XLSX / 文字 → 頁文字 → raw_doc 列
  apply-items.ts  套用提案（intake 與 answer 共用的唯一寫入點）
src/app/(main)/projects/                列表頁殼 + 編輯器
src/components/project/project-list.tsx 列表表格（拆出來才驗得了——見 pitfall #62）
src/app/(print)/preview/project/[id]/   渲染
src/app/api/projects/                   CRUD（admin client 寫，gate() 授權）
src/components/project/                 編輯器 UI
scripts/seed-project-eor.ts             EOR100/EOR200 pilot（--reset 重建）
```

## 現況（2026-08-24）

功能全貌見 [README.md](../README.md) 的 **Tender Datasheets** 一節。這裡只記還沒做的。

**還沒做**：
- **掃描版 PDF** 讀不到（會明講，不會靜靜失敗）
- **殘留掃描只比對代碼型規格**（IP／802.3）。溫度、天線數這類要更聰明的比對
- **規格編輯仍然是文字語法**。「最終規格表」已補上視覺回饋（逐格標 來源／改過／新增，
  隱藏列可點回來），擺位也有 `@first` / `@after` 了，**但改值還是要打規則**。
  下一步是把那張表變成每格可直接編輯——**等實際用一輪再決定，不要先做**
- **自由排序**：目前是「合併各欄、各欄保持自己的相對順序」＋ `@first` / `@after`，
  沒有「把這列拖到那裡」
- **ODM 硬體變更需求書**（見上方 §還沒做）——資料已經齊了，等真的拿到案子要發給 ODM 時再做
- **後台串圖像模型**：目前情境圖是把提示詞複製出去、在自己的圖像工具產完再上傳
  （後台只組提示詞，image-prompt.ts）。要做成後台生成的話，
  關鍵不是按鈕是**提示詞模板**——必須是「固定房規 + 只填場景」，不能給空白 prompt 框
  （不同調整頁就散）。自動帶產品照當參考、一次產 2–3 張候選、**人選一張才掛上去**。
  三個前置：① API 要支援 reference image；② **不要用 `openai_api_key`**（那是 embedding 專用），
  要自己的 key + 自己的 `feature` 標籤；③ 3–8 分鐘的生成要走背景工作 + 輪詢
