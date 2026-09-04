# CLAUDE.md — Product SpecHub (apps/spechub)

> Last updated: 2026-09-04。Monorepo 拆分完成（Phase 1–5, 2026-06-13 cutover;剩
> 藍圖 §6 登入驗收、repo rename 兩件手動收尾,見
> [`docs/monorepo-split-plan.md`](docs/monorepo-split-plan.md)）。RAG/Ask/Knowledge 全在
> **apps/engenie**;共用碼在 packages `@eg/db` / `@eg/auth` / **`@eg/llm`**。
> RAG/Ask 的事去看 [apps/engenie/CLAUDE.md](../engenie/CLAUDE.md)。
> **近期（2026-08-06~07）：西文 es-MX 上線 + 翻譯行數預算 + LLM 全面走 OpenRouter
> + 花費帳本 + 翻譯審核流程。這四塊互相咬合，動之前先讀
> [`docs/spanish-openrouter-review.md`](docs/spanish-openrouter-review.md)** ——
> 裡面有三個「看起來多餘、其實不能拆」的設計，以及行數預算為何不能用字數比例。
> 🔴 **2026-09-03~04：全專案 code review + 五波修正（PR #49–#56, migrations 00048–00052）。**
> 最重要的一件事:**資料庫曾經是最弱的一層。** `app_settings`（六把 LLM 金鑰明文）
> 和三張翻譯表對 **anon** 可讀可寫,任何 Google 帳號拿到 session 就能寫產品目錄,
> `x-vercel-cron` header 可偽造。全部已關（00048–00049,已套 prod,**金鑰仍待輪替**）。
> 動 RLS / auth / cron 之前先讀 memory 或那幾支 migration 的註解。
> 其餘四波:靜默寫入（**67 處**未讀 `error`,現由 `npm run check:db-writes` 擋）、
> 正確性（規格表改為原子重寫、PDF 不再發布 404、Tender 編輯器不再蓋掉抽取結果）、
> 硬化（SSRF、demo cookie 過期、Google auth 快取）、以及剩下的 High。
> **三條路徑經查從來沒生效過**:語系 hardware 圖同步、每週 Google Doc 重抓、
> DC 封面的翻譯值。**每日 09:00 排程當時已連續 504**（`maxDuration` 60→300 + auth 快取後修復）。
> **2026-08-06~07：西文 es-MX + 行數預算 + 全面 OpenRouter + 花費帳本 + 翻譯審核**——
> 四塊互相咬合,動之前先讀 [`docs/spanish-openrouter-review.md`](docs/spanish-openrouter-review.md)。
> **2026-08-20~24：Tender Datasheets**（標案用暫時性 datasheet, `/projects`;
> **刻意跟目錄平行的孤島**, migrations 00038–00047）——動之前先讀
> [`docs/project-datasheets.md`](docs/project-datasheets.md)。
> **2026-08-12~13：四種版型的字型/字級整併**（細節在下方 Brand & Visual System 與 pitfall #50）。

## Project Overview

**Product SpecHub** — EnGenius 產品規格管理與 Datasheet 自動化系統。
從 Google Sheets 同步產品資料到 Supabase，前端提供 Dashboard 管理、
Spec Comparison、Change Log，並能生成 PDF Datasheet（多語言）。

另含 **Tender Datasheets**（`/projects`;標案用的暫時性 datasheet,
與產品目錄平行、永不進 sync/RAG）。

**6 個 solution 上線**：**Cloud**（9 條線,含 **Cloud PDU**——ECP 四台,預設藍、
無天線頁、保留 QSG QR）、**Accessories ▸ Transceiver**（綠色、
無 hardware 頁、Contact-Us QR）、**Data Center ▸ Edge Network Appliance + AI Server**
（navy 專屬組件）、**Broadband Outdoor ▸ Broadband EOC**（鋼藍;**同時出 per-model
與整系列兩種 datasheet**）、**Edge AI Box ▸ Orin Box**（teal;`ds_scope='series'`,整系列一份）、
**Station Outdoor ▸ Station AP**（鋼藍 navy;Contact-Us QR;**只是 `getTheme()` 一組配色,
不是新組件**——參考稿量測後就是 Cloud 骨架換色）。
**Broadband / Data Center / Edge AI 三種自訂版型都吃 `?lang=`**（ja/zh-TW 走
`product_translations` + 該語系的 CJK 字型）。
架構支援**多 Solution 擴展**（`solutions` 表 + `/dashboard/[solution]` 路由;新增產線見
下方 Architecture 的 product-line onboarding）。
另含**內部競品比較 Battlecard**（`/battlecard/[line]`;Cloud AP / Camera / Switch / L3 Switch）。

功能清單與產品定位詳見 [README.md](README.md)。

## Monorepo 接點（重要）

與 **EnGenie**（apps/engenie）共用同一個 Supabase（`xzolvtlqafwkxfuaryec`）：

1. **sync 後自動 re-index**：`/api/sync` 完成後 POST EnGenie 的
   `/api/cron/reindex-products`（`Bearer CRON_SECRET`，兩 Vercel 專案同值；
   `ENGENIE_INTERNAL_URL` 指向 engenie 網域）。失敗不擋 sync —— EnGenie 每日
   09:30 TW 有全量備援 cron。
2. **Ask 入口只剩 EnGenie 浮動 widget**（`components/layout/engenie-widget.tsx`，
   workspace `spechub`，由 `NEXT_PUBLIC_ENGENIE_URL` 載入 widget.js）。**navbar 不再放
   Ask / Knowledge**（2026-06-14 移除跨站連結與死碼 `ENGENIE_URL`/`showAsk`/`showKnowledge`，
   commit db17c56）——跨站跳轉會讓使用者 confuse、且 widget 已就地覆蓋問答。**別再加回
   navbar**；要瀏覽整個知識庫請直接去 EnGenie 站。
3. **LLM provider keys 管理 UI 在 EnGenie**（settings 首頁有連結卡）；本 app 的
   translate runtime 直接讀共用 `app_settings`（`@eg/db/settings` 的 `getApiKey`）。
   **2026-08-06~07：所有 chat completions 走 OpenRouter**（`@eg/llm`）——
   translate、battlecard、engenie 的 Ask 都是；**三家直連的 client 已刪除**。
   兩把 key：`openrouter_api_key`（SpecHub）與 `openrouter_api_key_ask`（Ask，
   沒設會 fallback 回前者），也是花費帳本的兩個統計桶。
   **模型清單在 `llm_models` 表**，管理頁在 **EnGenie `/settings/models`**；
   本 app 只留唯讀的 `/api/settings/models?surface=translate` 給翻譯下拉。
   ⚠️ **`openai_api_key` 永久保留** —— RAG embedding（`text-embedding-3-small`,
   1536 維）不走 OpenRouter，換 embedding model 等於全量重建索引。
   查 model slug：`npx tsx scripts/list-openrouter-models.ts <關鍵字>`。
4. **產品表 schema 演進權在本 app**；改 products/product_lines schema 前要確認
   EnGenie 的 ingest-products/taxonomy 不受影響。migrations 一律放
   `packages/db/supabase/migrations/`。

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **UI**: Tailwind CSS v4 + shadcn/ui；**Table**: @tanstack/react-table（Compare 頁）
- **Backend**: Supabase via `@eg/db`（Postgres + Storage + Auth via Google OAuth）
- **Auth**: `@eg/auth` — @supabase/ssr + Google OAuth + DB whitelist + 4-role RBAC
- **Deployment**: Vercel（專案 `ds-generator-eg`，Root Directory `apps/spechub`）+ Vercel Cron
- **Data Source**: Google Sheets API + Google Drive API → synced to Supabase
- **Notifications**: Telegram Bot API
- **PDF**: Puppeteer (server-side) + browser print (client-side)

## Next.js 16 Breaking Changes (IMPORTANT)

- `params` and `searchParams` are **Promises** — must be awaited
- `cookies()` and `headers()` are **async** — must be awaited
- Fetch requests are **not cached by default**
- Server Components are the default; use `'use client'` for state/hooks/events

## Directory Structure

完整檔案地圖見 [`docs/file-structure.md`](docs/file-structure.md)。要記住的是：

- **`(main)/`** = 受白名單 gate 的頁面（dashboard / product / compare / settings…），
  **headless 驗不了**（pitfall #62）；**`(print)/preview/*`** 帶 bypass header 可以直接抓
- **`lib/datasheet/`** 放版面計算與「依 category 而異」的規則。
  **`scale.ts` 是四種版型共用的字級/字重刻度（唯一來源）**,`bullet.ts` 是 CSS 畫的條列圓點
  （`qr.ts`、`radio-patterns.ts` —— 不要在元件內就地判斷 category）
- **`lib/google/`** 是所有 Sheets / Drive 存取的入口
- 共用碼在 repo root 的 `packages/`：`@eg/db`（含 **migrations 唯一來源**）、`@eg/auth`

## Architecture & Data Flow

### 同步、狀態、圖片 → [`docs/datasheet-sync.md`](docs/datasheet-sync.md)

Google Sheets → Supabase 同步(欄位映射)、Product Status(active/upcoming/pending)、
Smart Sync(Drive modifiedTime + deep diff)、sync 後觸發 EnGenie re-index、
locale-aware 圖片雙向同步。另見 [`docs/sync-and-notifications.md`](docs/sync-and-notifications.md)。

### Datasheet 渲染:PDF / 版面 / 多語言 → [`docs/datasheet-rendering.md`](docs/datasheet-rendering.md)

PDF 生成(Regenerate/New Version、Puppeteer 自我認證、Drive folder auto-create/dedupe、
locale 未核准阻擋)、動態 cover 版面 + spec 2 欄分頁(`lib/datasheet/`,**locale-aware
metrics 常數須對齊 preview CSS — pitfall #50/#51**)、多語言 datasheet
(en/ja/zh-TW/**es**、**四態審核**(`draft`→`pending_review`→`approved`/`changes_requested`,
`draft` = 還沒送審、`pending_review` = 已送審待審,佇列只撈後者;`confirmed` 是
`review_status='approved'` 的 generated column)、per-locale typography **四語系皆可調**、**6 層 AI 翻譯 prompt**
——第 6 層是從原文算出的行數預算,防止譯文變長把封面擠爆)。**改 PDF/版面/翻譯前先讀該檔。**

### Authentication & RBAC → [`docs/auth-rbac.md`](docs/auth-rbac.md)

三層強制:`proxy.ts`(session refresh + auth gate;公開路由 = `/auth/` 前綴、service
path `/api/sync`、以及 `PUBLIC_EXACT_PATHS` **精確比對**的單頁白名單——目前只有
`/design/datasheet-type-spec.html`,**全站唯一免登入的頁面**,故意不用 `/design/` 前綴
以免之後丟進那個資料夾的檔案自動變公開)→ `(main)/layout.tsx`(whitelist 檢查)→ per-route gates
(`gate()`/`gateOrCron()`/`adminOnly()`/`requirePagePermission()` + client `can()`)。
4 角色矩陣在 **`@eg/auth/permissions`**(packages/auth)。**改 auth/proxy/權限前先讀該檔。**

### Tender Datasheets（標案 datasheet, on-demand）→ [`docs/project-datasheets.md`](docs/project-datasheets.md)

Project business 用的暫時性 datasheet：拿 ODM／他牌規格表 → 換 EnGenius 命名/照片/版型
→ 出一份談 tender 的 PDF。`/projects`（gate `project_datasheet.*`，**只有 admin/editor**）、
渲染在 `/preview/project/[id]`、表是 `project_datasheet*`（migrations 00038–00047）。
**改這塊前必讀該檔。** 關鍵雷:
① **這是平行孤島,沒有升格成 products 的路徑**——一台只報過價的型號進了 `products`,
EnGenie 就會開始跟人說我們有賣它;
② **最終規格表不存**,是 `raw_doc ⊕ rules` 每次 render 算出來的（換模型重抽/原廠出新版
才不會洗掉人為修改）;規則 key 是 label 正規化字串,**重抽後失效的規則要當孤兒列出來,不能默默吃掉**;
③ **PRELIMINARY 聲明關不掉**（DB not null + check）、圖片註記同理——文字可編、存在與否不可編;
④ **`project-preview.tsx` 是獨立元件**,不是 broadband-preview 加參數;配色是**抄的不是共用的**,
否則一次性標案的調色會回頭改到出貨中的 EOC datasheet;
⑤ 出 PDF 走**瀏覽器列印**不走 `/api/generate-pdf`（後者會寫 version、進 datasheets bucket、開 Drive 資料夾）;
⑥ 這支元件**不在** type-spec 產生器的 COMPONENTS 清單裡,**不要加**——那頁是免登入的;
⑦ **gap review 是這個模組的核心不是打磨**（`gap-scan.ts`,缺／疑／險三類,**deterministic 無 LLM**）——
blocking 的分界是「文件會不會寫錯」而不是「缺多少」,所以 14 格 TBD 不擋、一個沒來源的 IP67 擋;
finding 是算出來的,`project_datasheet_questions` 只存人做了什麼,**severity 不存**;
真正的產出是**可以貼給業務/RD/ODM 的澄清訊息**（`brief.ts`,模板不是 LLM）——能回答的人都不在站內;
⑧ **兩種起點**:ODM 規格表,或**從既有型號帶入**（`seed-from-product`,目錄→專案**單向**,
反向永遠不開）。兩者的 gap review 判斷**方向相反**——ODM 補一個沒來源的規格是 blocking,
既有型號補一個官方沒寫的規格是 advisory（那正是標案要的）;反過來,改動既有型號的值是
最尖銳的 finding（`catalog_deviation`),因為客戶可以把公開 datasheet 拿來並排比對。
**在文件層級兩者不衝突**（自家型號 + sourcing 型號並排是真實情境）,**型號層級才互斥**——
套用抽取會改 `source_id`,那一欄就掉出 `catalogModels`、判斷方向整個反轉,所以覆蓋前會跳警告;
⑨ **`status` 和「出圖」是兩個軸**:`status` 是「能不能送出去」（draft→ready 有守門）,
issue 是「實際出過幾份 PDF」。**列印刻意不動 status**(要能印草稿校對),但列印列會顯示
「還有 N 項未確認」。⚠️ **要講還剩幾項一律用 `openBlockers()`**（`lib/project-datasheet/blockers.ts`）
——它會扣掉人已 answered/dismissed 的,跟 `scanDocument()` 的原始結果是兩回事;
Ready 守門、列印列、預設落地頁籤三處共用同一支;
⑩ **編輯器和列印共用的幾何要放共用模組**——標籤的位移和字級各寫一份,連續兩次
「編輯器看起來對、PDF 不對」,現在集中在 `label-geometry.ts`;
⑪ **凡是把 `images` 讀成「手寫欄位清單」的 parser 都會靜靜吃掉資料**——
caption、labels、body 各中一次:載入時漏掉 → 面板狀態是空的 → 下次存檔寫回空的,**且不報錯**。
一律用 spread 帶整包;
⑬ **兩家廠商把同一項規格叫成不同名字 → 兩列各半空**（列是用標籤合併的）。
`spec-align.ts` 用「有值欄位互補 + 同義詞表 + 值的形狀」配對，**同義詞表同時當拒絕條件**
（兩邊都在表裡但不同組就不配）；缺漏檢查給一顆一鍵合併，走 `model_hide` + `model_add`、
**值逐字搬不改**，plan 在伺服器重算不收前端的。⚠️ `blank_cell` 對這種列會給錯建議
（「跟 ODM 要」——值沒缺，在另一列），所以兩條刻意排在一起;
⑫ **AI 有四個步驟／五個呼叫點**（`extract` / `intake` / `questions` 的 propose /
**`scenarios`** / **`cover`**）,模型在
**SpecHub `Settings ▸ Tender Datasheets 的 AI 模型`** 改（存 `app_settings`,改完立刻生效）。
兩支 drafter（情境文案、封面文案）**共用 `grounding.ts` 的否定契約**——只准引用算好的規格表、
規格隱含的能力不算、每點標依據、撐不起來的進 `declined`;**兩支路由都唯讀**,
草稿是填進表單欄位不存檔。**封面 drafter 刻意不給來源原文**（那是 gap-scan 的工作,
餵給起草等於把廠商話術洗成我們的）。**從既有型號帶入不用 AI**——直接帶我們自己的文案,
只填空的欄位（`catalog-copy.ts`）。
`lib/llm/models.ts` 的常數是 **DEFAULT 不是值**;目錄（有哪些模型）仍是 EnGenie 的 `llm_models`。

### Competitor Battlecard → [`docs/battlecard.md`](docs/battlecard.md)

內部競品比較(Cloud AP MVP)。`/battlecard/[line]`(gate `battlecard.view`)、API 在 `api/battlecard/`、
UI fork 自 compare-table。半自動抽取(**↻ sync** datasheet / **🔍 web** 補空格)→ PM 確認制。
**改 battlecard 前必讀該檔** —— 關鍵雷:`confirmed` 只升不降、auto-extract 不覆蓋已確認格、tier 是關係層、
新表要手動加進 `database.generated.ts`、需 `FIRECRAWL_API_KEY`、別用 comparisons 的全刪重插。

### 產品線 onboarding + 各線 datasheet 變體 → [`docs/product-line-onboarding.md`](docs/product-line-onboarding.md)

**新增 solution / 產品線前必讀該檔。** 涵蓋:建線 recipe、sheet 契約(含選填的
`DS Feature Groups` 列 → `products.ds_features`,以及線層共用文案的
`[For DS] Overview & Features` 頁籤 → `line_datasheets`)、圖片命名 + **PNG 自動裁
透明邊**、**antenna slot 依產品推導**(`lib/datasheet/radio-patterns.ts`)、
**6 種 datasheet 變體**(Cloud 藍 / 灰 / Transceiver 綠 / DC navy / Broadband 鋼藍 /
Station navy)、**新版型先量參考稿再決定要不要開組件**(Station 量完發現就是 Cloud
骨架換色,只花一組 `getTheme()`)、
**`ds_scope` 三態**(`model`/`series`/`both`——`both` 用同一個組件渲染兩種 scope,
版號兩條流)、以及做新變體時踩過的雷(pymupdf 量參考稿、流式排版、自動縮放要校準、
參考圖內建文字要裁掉、footer 綁最後一頁而非某個 section)。
**關鍵雷**:① sync 只匯入「Web Overview 有列」的型號,漏列 = 靜默不同步;
② **category 判斷一律精確比對且集中在 `lib/datasheet/qr.ts`**(pitfall #61);
③ Drive 各線/各語言資料夾**自動建**,但 `drive_folder_id`/`ds_images_folder_id` 常填反。

## Brand & Visual System

- Primary Blue: `#03a9f4` → `text-engenius-blue`, `bg-engenius-blue`
- Dark Text: `#231f20`；Gray Text: `#6f6f6f`；NO pure black `#000000`
- **Heading font**: Plus Jakarta Sans (`font-heading`)；**Body**: Geist Sans
- **字級可調範圍**：`Settings ▸ Typography` 現在涵蓋 **en / es / ja / zh-TW 四個語系**
  （2026-08-10 起拉丁語系也進來了,值就是原本寫死在 CSS 裡的那組,輸出零變化）。
  **但只管得到版型 A** —— B/C/D 沒有 DB 覆寫,要改得動程式。
  ⚠️ **但它們也不再各寫各的**:2026-08-12 起四種版型的字級/字重都引用
  `lib/datasheet/scale.ts` 的 `PT` / `WT`(10 階 / 5 種字重)。元件裡不該再出現
  `font-size: 9pt` 這種字面值 —— 產生器會擋下不在刻度上的值(見下)。
  ⚠️ **`font_family` 是「內文字體」,不是全部** —— 四種版型的標題（封面主標/副標/型號、
  頁首分類、所有段落標）一律 **Manrope**,寫死在元件裡（`displayFontStack()`）;
  設定頁改的是內文 Roboto。CJK 語系兩條 stack 都會把語系字型放最前面（pitfall #64）。
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

## Database Tables

完整 schema、欄位語意與擁有權見 [`docs/schema.md`](docs/schema.md)。

```
solutions → product_lines → products → spec_sections → spec_items
                             products → image_assets, change_logs, versions
             product_lines → line_datasheets        (線層共用 datasheet 內容)
auth.users → profiles ← email_whitelist.invited_by
```

- **本 app 擁有 products / product_lines / line_datasheets / versions / 翻譯相關表的
  schema 演進權**；documents / ask_workspaces / api_keys 等屬 EnGenie。改共用表前要
  確認 EnGenie 的 ingest 不受影響
- **migrations 一律放 `packages/db/supabase/migrations/`**，新表要手動加進
  `database.generated.ts`
- 兩個最常踩的欄位雷：`versions` 的 UNIQUE 要含 **locale**（pitfall #45）、
  products 的三個 image 欄位是 **`NOT NULL DEFAULT ''`**，清空寫 `""`（pitfall #60）

## Conventions

- Supabase query builders 是 **PromiseLike** 但不是完整 Promise → 要用 `as { data: T | null }`
- PDF preview 用 inline `<style>` + absolute positioning 排版，不用 Tailwind
- Loading states 用 `loading.tsx` skeleton pattern
- Drive 資料夾結構與命名規則詳見 [`docs/drive-folder-and-naming-rules.md`](docs/drive-folder-and-naming-rules.md)
- **API gate pattern**: 寫入 API 開頭 `const denied = await gate("permission"); if (denied) return denied;`
  （cron-callable 用 `gateOrCron(request, ...)`）— 皆來自 `@eg/auth/session`
- **會花錢的 API 用 `gateWithRateLimit(permission, { key, max, windowSeconds })`**（2026-09-04 起）——
  LLM、抓取、embedding 的端點一律：translate 30/分、spec-labels 10、battlecard websearch/resync 10、
  Tender 五支 AI 10–20。key 是「端點:使用者 id」，一個人的迴圈只會卡到自己。底層是
  `auth_rate_check` RPC（固定視窗，`@eg/db/rate-limit`），fail-open 但會大聲記錄
- **Page guard pattern**: server component 開頭 `await adminOnly()` / `await requirePagePermission("xxx")`
- **UI hide pattern**: layout/page 拿 role → client component 用 `can(role, "permission")` 包按鈕。三層 gate 都要做
- **Supabase write error checking**: 所有 write 都要看 `error`。
  `throwIfDbError(label)(res)` / `logIfDbError(label, res)` 在 **`@eg/db/errors`**
  （2026-09-04 之前它只是 generate-pdf 裡的一個區域閉包,所以「慣例」只有那個檔案在遵守）。
  **`npm run check:db-writes` 會擋**——真的不需要知道結果的寫入,用
  `// db-write-unchecked: <理由>` 明講。throw 還是記錄是逐處決定:
  在 per-product try 裡 throw 會記進那台產品、其他繼續;迴圈裡的清理用 log
- **Sync 一次只能跑一支**: `/api/sync` 用 `app_settings.sync_lock` 取鎖（INSERT 決勝負,
  10 分鐘 TTL）。cron 和 Sync 按鈕本來會重疊,交錯的 delete/insert 會留下重複列
- **一條線裡的產品是並行跑的**（`PRODUCT_CONCURRENCY = 4`,`lib/concurrency.ts` 的
  `mapConcurrent`）,Drive 資料夾清單一次 run 只列一次（`DriveListingCache`,**run-scoped**,
  不是模組級——模組級會讓下一次 run 看到 PM 上傳之前的清單）。產品之間不共用任何列所以
  可以重疊;**新增會跨產品共用的狀態時要問「並行下會不會做兩次」**（pitfall #75）
- **PDF gen UX**: 兩條路徑都用 `toast.loading` → `toast.success` + `Open PDF` action button（pitfall #47）

### UI Layout Conventions

- **Dashboard 兩行 toolbar**: Row 1 = product line tabs；Row 2 = Active toggle | Compare
  Changelog Translations | Sync + Lang column 顯示已啟用語言 badges
- **Product page sticky header**: `sticky top-14 z-20`
- **Breadcrumb**: `[ProductLine] / [Model]`，ProductLine 連結帶 `?line=` 回正確 tab
- **Solution sidebar**: 預設收合；展開 `w-64`。**有產品線的 solution 排在
  「soon」佔位之前**（在元件內依 `product_line_count` 推導,不是 `sort_order`——
  這樣新線一上就自動上移）
- **Datasheet 版型 = 4 個結構元件 + 標準版型的 4 種配色**（不是「6 種變體」）：
  A 標準 `preview/[model]/page.tsx`（Cloud 藍 / 灰 / Transceiver 綠 / Station 鋼藍,
  只有 `getTheme()` 換色）、B `datacenter-preview.tsx`、C `broadband-preview.tsx`
  （單機+系列共用）、D `edge-ai-series-preview.tsx`（**寫死 en,不支援多語系**）。
  **四種版型共用一套字級刻度**(`lib/datasheet/scale.ts`)與一條字體規則:
  標題 Manrope、內文 Roboto、條列圓點是 CSS 畫的 `0.5em` 圓(不是字元 —— 打字元會讓
  圓點大小變成「字型的屬性」而不是設計的屬性,英文曾經只有中日文的 48%)。
  **每一種的字型/字級/顏色/logo 對照表 → [`/design/datasheet-type-spec.html`](public/design/datasheet-type-spec.html)**
  （站上免登入可看,字級以真實 pt 排出）。新增產品線見
  [`docs/product-line-onboarding.md`](docs/product-line-onboarding.md)

## Current Status

功能清單詳見 [README.md](README.md)。

### 🔜 Next Steps

**🔴 Code review 的收尾（2026-09-04,詳見 memory `project-code-review-2026-09`）**：
0a. **輪替 `app_settings` 的六把金鑰 + 重新產生 `VERCEL_AUTOMATION_BYPASS_SECRET`**
   —— 門關了但鑰匙沒換。金鑰在 EnGenie `/settings/api-keys` 改。
0b. **手動按一次 Generate PDF、問 Ask 一題** —— 這兩條 headless 驗不了
   （`gate()` 需要真 session）,是這幾波唯一沒有 production 佐證的改動。
0c. **看隔天的 09:00 排程** —— 它之前連續 504,第一次成功會補完累積數週的變更,
   Telegram 可能一次比較多則。那是正常的。
0d. **審查清單全部關閉（2026-09-04）。** 去重只做了 auth 頁面/路由（`@eg/auth/pages|routes`）和 `getGoogleAuth()`（`@eg/google`）；`ui/` 與 `user-menu` 刻意各留一份（**拆分的殘留**——
   EnGenie 本來是 DS Generator 裡的一個功能,長大後拆出去;`ui/` 是刻意各留一份讓品牌分道,
   去重只該碰 auth 頁面 / `google/auth.ts` / `utils.ts`）。
   **2026-09-04 已完成**：分頁的兩套量法、B/C/D 圖片框、feature 行數核對、
   sync 的產品並行 + 每個 Drive 資料夾一次 run 只列一次、前端十項小修
   （語系選單權限、Preview 看回應、battlecard 確認與 in-flight、dashboard 只撈最新一筆、
   Tender 時區、page guard 導向、對外 API 錯誤、embed CSP、配額 RPC 列鎖 00053）、
   **正確性一批**（審核 approve 看狀態/存在/內容、websearch 不碰已確認格、鎖狀態需登入、
   審核者須有 `review.approve`、**drafter 的 `basis` 對規格表核對**（`groundBullets`,
   查無此列就清空依據並列出）、**翻譯行數預算伺服器端驗證**（`lineParityCheck`, 超出重試一次再回報）、
   **Ready 文件在任何寫入後重驗 blocker**（`demoteIfBlocked`, 六個寫入點）、
   **版號取 Drive 與 DB 較高者**（`resolveNextVersion`, 半失敗的前一次不會讓這次重發同號）、
   B/C 版型印語系自己的版號）、**EnGenie 硬化一批**（PR #61：`<source>` 邊界、隱藏 HTML、
   請求上限、`pickModel`、scrypt passcode、token 制 embedding 上限、hash 預讀報錯、
   topology-icons 收 workspace、追問切法、三條 pipeline 修剪殘尾）。

**產品線 / 版型**：
1. **待補素材 / 待 PM 處理的項目**（缺圖、EOC 日文待 Confirm、EOC sheet 的
   「16 devices」錯誤、Cloud AP 素材缺口）→ 見
   [`docs/pending-assets.md`](docs/pending-assets.md)。
   ⚠️ 圖檔名是**單底線**（`S41__product.png` 雙底線曾靜默同步不到）。

**Datasheet 系統**：
5. **多國語言擴展到其他產品線** — 需為 AP/Switch/NVS/VPN FW 建立 product-line prompt
   （`translate/prompts/product-lines/`,目前只有 Cloud Camera 有）
6. **翻譯 feedback 偵測** — Save 時偵測使用者修改，建議加入詞庫
7. **第 3 張 Hardware 圖** — `hardware_image_2` 已上線（DC 線用）,若要 front/rear/bottom
   三張需再加一欄 + upload API 型別
7b. **渲染端改動需重產 PDF 才生效** — 2026-08-12~13 的字型/字級/分區間距/logo 全是渲染端,
   已產出的 ~90 份 PDF 仍是舊版,挑產品線 Regenerate 才會套用。**CJK 字級收斂尚未做**
   （`scale.ts` 只涵蓋 en/es;ja/zh-TW 在 `app_settings`、刻意較大,要不要一起收斂是獨立決定）。
**系統**：
8. **Auto invite email** — admin 邀請後自動通知（Resend / Supabase email）

**多語言（2026-08-07 現況）**：
9. **日文規格標籤只翻了 Cloud AP** — `spec_label_translations` 是**產品線層級**;
   Cloud Camera / L3 Switch / VPN Firewall / AI-NVS 有日文產品但標籤是英文,
   Broadband EOC 連繁中都沒有（那條線從沒開過標籤編輯器）。
   補法:`/translations/[line]` → Japanese → AI Translate Empty Fields,每條線約 $0.006。
   **產 PDF 寫死 `mode=full`,所以沒翻就是印英文。**
10. **`product_translations.translation_mode` 欄位沒有人讀** — 編輯器的 Light/Full
   下拉已於 2026-08-07 移除（它什麼都沒改變）,存檔固定寫 `full`。欄位本身還在,
   要清掉是另一個 migration。
11. 🔴 **審核流程目前休眠（2026-08-12 Terrel 主動關掉,說是「先」移除）** —— 程式全在,
   但**沒有任何語系被指定**,所以每個語系都是 MKT 一鍵 Confirm。
   **看到 review 相關程式碼不要以為它在跑**;要重開就回 `/settings/users` 點語言旗標。
   ⚠️ **`review_locales` 三種值語意不同**:`NULL` = 可審全部但不指定任何語系（admin 正確預設）;
   `['es']` = 指定 es 需審核且此人只能審 es;`[]` = 不指定任何語系**且此人什麼都不能審**。
   關流程時只清掉「被指定的語系」,**不要把 admin 也設成 `[]`** —— 曾因此讓 ECS1528FP/es
   卡在 `pending_review` 而全公司沒人能核准。
   ⚠️ 決定不做第五個角色（editor+review.approve）:分公司維持只審不改。

**Battlecard**（MVP 已上線,功能詳見 README）：
12. **競品資料補完** — Meraki(CW9164/MR46)行銷頁規格稀疏,待 ↻sync/🔍web 或 PM 補;
   5 維度(MLO/Recommended Users/BSS Coloring/Warranty/MSRP)刻意留白給 PM
13. **擴到其他產品線** — 目前只有 Cloud AP 有 dimension 模板 + matchup;Switch/NVS/VPN FW 待建
   （dashboard toolbar 的 Battlecard 連結目前也只在 Cloud AP 顯示）
（註:使用者 2026-06-16 決定 ↻sync 與 🔍web 維持兩顆手動按鈕,不自動串接）

## Deployment

```bash
npm run dev      # repo root — 轉發到 spechub (port 3000)；engenie 是 -w engenie (port 3100)
npm run build
npm run lint
```

- Vercel 自動部署 main branch；Cron: `/api/sync` 每天 09:00 台灣時間、
  **`/api/cron/health` 每天 10:00**（讀 `job_heartbeats` + 探測向量檢索 + 比對 chunk 數，
  有問題發 Telegram；每週一送一則「一切正常」當 dead-man switch。判斷邏輯是
  `lib/monitoring/health.ts` 的純函式，有測試）
- **⚠️ Vercel function region 釘在 `hnd1`（東京）— 不要改**。Supabase 在 ap-northeast-1，
  跨區每 query +170ms
- **Server component query 並行化** — 互相獨立的 query 塞同一個 `Promise.all`
- 需要的 env vars: `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `GOOGLE_SERVICE_ACCOUNT_JSON`, `TELEGRAM_BOT_TOKEN/CHAT_ID`, `CRON_SECRET`（與 engenie 同值）,
  `VERCEL_AUTOMATION_BYPASS_SECRET`, `PDF_PREVIEW_BASE_URL`, **`ENGENIE_INTERNAL_URL`**,
  **`NEXT_PUBLIC_ENGENIE_URL`**, `API_KEY_ENC_SECRET`（讀共用加密設定時需要）,
  **`FIRECRAWL_API_KEY`**（battlecard ↻sync / 🔍web 抓取用;Vercel prod/dev/preview 已設）
- AI 翻譯 keys 在 EnGenie `/settings/api-keys` 設定（共用 app_settings），env 可覆蓋
- **Vercel link（`.vercel/`）在 monorepo 根,不在 apps/spechub** — 跑 `vercel env` 等指令要在根目錄

## Common Pitfalls

> **這裡只留「改任何東西都可能踩到」的七條。** 其餘只有動到特定東西才需要,
> 全文在 [`docs/common-pitfalls.md`](docs/common-pitfalls.md)。

45. **Supabase 的 write 不 throw** — 回 `{ data, error }`，沒人讀 `error` 的寫入是隱形的：
    路由回 200、toast 說已儲存、資料列不存在。踩過至少四次。**2026-09-04 起這是護欄
    不是記憶**：`npm run check:db-writes`（CI）會擋，helper 在 `@eg/db/errors`。
    第一版護欄報 32 處、修掉自己的誤判後報 **67 處**。

62. **`(main)` 群組的頁面 headless 驗不了** — 受白名單 gate（`(main)/layout.tsx` 的
    `getCurrentUser()`），帶 `x-vercel-protection-bypass` 也只過 proxy、仍會 307 到
    `/auth/no-access`。**只有 `(print)/preview/*` 能用 bypass 直接抓**。所以動到
    dashboard/內頁時：typecheck+build 之外，要推 branch preview 請使用者點過再 merge。
    本機解法見 #71。

69. **任何「沒發現問題」的檢查,要先能證明它在有問題時會叫。** 版面檢查器曾兩次「假綠」
    （`.page` 是 `overflow:hidden` 所以 `scrollHeight` 永遠等於 `clientHeight`；
    reused 的 dev server 吐 0 頁而 0 頁當然不溢版）。這條在 2026-09-04 又付了一次錢：
    `check:db-writes` 第一版把外層的 `if (x.length > 0)` 當成「有人在檢查」,報 32 處；
    修掉之後報 67 處。**這一波每一支新護欄和新測試都先在壞掉的程式上跑紅過。**

70. **Client component 的 state 用 props 當初值,而伺服器在表單外面寫了同一批欄位** ——
    畫面不更新是輕的那一半,**未存變更的判斷會把表單標成 dirty,下一次存檔就把空值蓋回去**。
    2026-09-04 在 Tender 編輯器的另一半又出現一次（model 的 `raw_doc`/`rules` 從不被認領,
    所以「寫入 N 列」之後 Save 會送 `raw_doc: []` 蓋掉抽取結果）。
    修法是**逐欄位**協調：欄位還等於伺服器上次的值才認領新值,人打過字的活下來。

72. **「收緊」一個設定也是一種改動,要問「我剛拿掉的東西有誰在依賴」**（2026-09-04）——
    把函式釘成 `search_path = public` 讓 pgvector 的 `<=>` 消失,**Ask 檢索壞了一整天
    沒有任何監控叫**；拿掉 `/api/sync` 的 GET 讓隔天的排程回 405。

73. **分不清「沒有」和「失敗」時不要動資料；能降級就不要中斷** —— `canClear()`（圖片）、
    `allowedKnowledgeAreas()`（workspace 私有領域）、產品下架只回報不動作。

74. **先寫再刪,不要先刪再寫** —— ingest 四條 pipeline 的 embedding 失敗曾能刪掉整個來源。

75. **只記「值」的快取在並行下會把副作用做兩次** —— 串行改並行時,每個「先查快取、
    沒有就做」都要重看;記 promise 不記值,失敗的要踢掉。

> 以上每條的全文、以及只有動到特定東西才需要的
> #50（分頁常數）/ #60（NOT NULL 圖片欄位）/ #61（category 精確比對）/ #63（版型 locale prop）/
> #64（CJK 字型）/ #66（圖片用框不用像素）/ #67（陣列長度對齊）/ #68（CJK_LOCALES）/
> #71（`/auth/probe`）,全在 [`docs/common-pitfalls.md`](docs/common-pitfalls.md)。
> #54–#58（RAG/聊天）在 [apps/engenie/CLAUDE.md](../engenie/CLAUDE.md)。

## 詳細文件

- [`docs/monorepo-split-plan.md`](docs/monorepo-split-plan.md) — 拆分藍圖（歸屬/階段/驗收/回滾）
- [`docs/file-structure.md`](docs/file-structure.md) — 完整檔案地圖 + 放東西的規則
- [`docs/schema.md`](docs/schema.md) — DB schema:關係圖、擁有權、各表欄位語意
- [`docs/common-pitfalls.md`](docs/common-pitfalls.md) — Pitfalls 全文。**CLAUDE.md 只留
  #45 / #62 / #69 / #70**（改任何東西都可能踩到的四條）,其餘都在這裡
- [`docs/pending-assets.md`](docs/pending-assets.md) — 待補圖 / 待 PM 處理的庫存清單（某台產不出 PDF 先查這裡）
- [`docs/sync-and-notifications.md`](docs/sync-and-notifications.md) — Sync 機制 + Telegram 通知
- [`docs/datasheet-sync.md`](docs/datasheet-sync.md) — Sheets 同步、product status、圖片雙向同步
- [`docs/datasheet-rendering.md`](docs/datasheet-rendering.md) — PDF 生成、版面、多語言 + AI 翻譯
- [`docs/auth-rbac.md`](docs/auth-rbac.md) — 認證/proxy/RBAC 三層、權限矩陣、RLS
- [`docs/battlecard.md`](docs/battlecard.md) — 競品 battlecard:資料模型、抽取流程、關鍵雷
- [`docs/product-line-onboarding.md`](docs/product-line-onboarding.md) — 新增產品線、sheet 契約、各 category datasheet 變體
- [`docs/spanish-openrouter-review.md`](docs/spanish-openrouter-review.md) — **西文上線 / OpenRouter 遷移 / 花費帳本 / 翻譯審核**（2026-08-06~07）。
  **動這四塊之前先讀**——裡面有三個「看起來多餘、實際上不能拆」的設計（保留 `openai_api_key`、
  自己記帳而非用 OpenRouter per-key、`review_locales IS NULL` 不算指定審核者），
  以及行數預算為何不能用字數比例、engenie 為何不再走 GitHub Actions
- [`public/docs/drive-folder-and-naming-rules.html`](public/docs/drive-folder-and-naming-rules.html) — Drive 規則
- RAG / Ask / Search API → [apps/engenie/docs/](../engenie/docs/)
