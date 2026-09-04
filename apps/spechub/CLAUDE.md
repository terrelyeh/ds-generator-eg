# CLAUDE.md — Product SpecHub (apps/spechub)

> Last updated: 2026-09-04。**本檔只留「改任何東西都可能踩到」的內容**;只有動到特定
> 模組才需要的細節在 `docs/` 下,每一段結尾都有指標。
>
> Monorepo 拆分完成（Phase 1–5, 2026-06-13 cutover;剩藍圖 §6 登入驗收、repo rename
> 兩件手動收尾）。**RAG / Ask / Knowledge 全在 apps/engenie**,共用碼在 `@eg/db` /
> `@eg/auth` / `@eg/llm` / `@eg/google`。那邊的事去看
> [apps/engenie/CLAUDE.md](../engenie/CLAUDE.md)。
>
> 🔴 **2026-09-03~04：全專案 code review,75 項全部關閉（PR #49–#67, migrations
> 00048–00055）。** 最重要的一件事:**資料庫曾經是最弱的一層** —— `app_settings`
> （六把 LLM 金鑰明文）和三張翻譯表對 **anon** 可讀可寫,`x-vercel-cron` 可偽造。
> 全部已關,但**金鑰仍待輪替**（門關了鑰匙沒換）。動 RLS / auth / cron 之前先讀 memory
> `project-code-review-2026-09` 或那幾支 migration 的註解。
> **三條路徑經查從來沒生效過**（語系 hardware 圖同步、每週 Google Doc 重抓、DC 封面的
> 翻譯值）,**每日排程當時已連續 504 好幾天沒人發現** —— 後者現在有
> `/api/cron/health` 在看（見 Deployment）。
>
> **動這四塊之前一定要先讀對應的 doc**：
> 西文／OpenRouter／花費帳本／翻譯審核 →
> [`docs/spanish-openrouter-review.md`](docs/spanish-openrouter-review.md)（裡面有三個
> 「看起來多餘、其實不能拆」的設計,以及行數預算為何不能用字數比例）;
> Tender Datasheets（`/projects`,**刻意跟目錄平行的孤島**）→
> [`docs/project-datasheets.md`](docs/project-datasheets.md);
> datasheet 的字型/字級/logo → [`docs/brand-and-visual.md`](docs/brand-and-visual.md);
> 各領域待辦 → [`docs/next-steps.md`](docs/next-steps.md)。

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
**改這塊前必讀該檔。** 最容易踩的三條，其餘（含配色為何是抄的、套用抽取如何反轉
gap review 的方向、`status` 與出圖是兩個軸、`images` 的 parser）全在該檔:
① **這是平行孤島,沒有升格成 products 的路徑** —— 一台只報過價的型號進了 `products`,
EnGenie 就會開始跟人說我們有賣它;
② **最終規格表不存**,是 `raw_doc ⊕ rules` 每次 render 算出來的,規則 key 是 label 正規化字串,
**重抽後失效的規則要當孤兒列出來,不能默默吃掉**;
③ **gap review 是這個模組的核心不是打磨**（`gap-scan.ts`,deterministic 無 LLM）——
blocking 的分界是「文件會不會寫錯」而不是「缺多少」,所以 14 格 TBD 不擋、
一個沒來源的 IP67 擋。真正的產出是可以貼給業務／RD／ODM 的澄清訊息（`brief.ts`）。

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
- **datasheet 的版型／字級規範頁、logo 換檔、Cloud 封面置中的機制** →
  [`docs/brand-and-visual.md`](docs/brand-and-visual.md)。要動 PDF 的視覺之前先讀，
  裡面有三件會靜靜過期的事：規範頁是**產生**的不能手改、CJK 那張表的值在 DB 所以要跑
  漂移偵測、以及封面置中的數字綁死某一顆圖示的尺寸。

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
0d. **審查的 75 項全部關閉（PR #49–#67, migrations 00048–00055）。**
   哪一項在哪一支 PR、以及每一個決定的理由，看 memory `project-code-review-2026-09`
   或 `git log`。**這裡不留已完成清單** —— 它不影響下一個 session 怎麼寫程式。
   刻意只做一半的三件事:去重只碰 auth 頁面與 `getGoogleAuth()`（`ui/` 各留一份是
   拆分時的決定,品牌可分道）、passcode 是登入時才就地升級成 scrypt（沒人登入的
   workspace 留著舊雜湊）、限流只有每分鐘沒有每日上限。

其餘待辦（產品線素材、多語言擴展、翻譯 feedback、Battlecard 競品資料、自動邀請信）
按領域列在 [`docs/next-steps.md`](docs/next-steps.md)。**只有下面這幾條需要現在知道**：
⚠️ 圖檔名是**單底線**（`S41__product.png` 雙底線曾靜默同步不到）；
🔴 **翻譯審核流程目前休眠**（2026-08-12 主動關掉,程式全在但沒有任何語系被指定,
所以每個語系都是一鍵 Confirm）——看到 review 相關程式碼不要以為它在跑;
⚠️ **渲染端改動要重產 PDF 才生效**,已產出的 ~90 份仍是舊版。

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
- [`docs/next-steps.md`](docs/next-steps.md) — 各領域的待辦清單（做完就刪，不留歷史）
- [`docs/brand-and-visual.md`](docs/brand-and-visual.md) — datasheet 的版型/字級規範頁、CJK 漂移偵測、logo、封面置中
- [`docs/battlecard.md`](docs/battlecard.md) — 競品 battlecard:資料模型、抽取流程、關鍵雷
- [`docs/product-line-onboarding.md`](docs/product-line-onboarding.md) — 新增產品線、sheet 契約、各 category datasheet 變體
- [`docs/spanish-openrouter-review.md`](docs/spanish-openrouter-review.md) — **西文上線 / OpenRouter 遷移 / 花費帳本 / 翻譯審核**（2026-08-06~07）。
  **動這四塊之前先讀**——裡面有三個「看起來多餘、實際上不能拆」的設計（保留 `openai_api_key`、
  自己記帳而非用 OpenRouter per-key、`review_locales IS NULL` 不算指定審核者），
  以及行數預算為何不能用字數比例、engenie 為何不再走 GitHub Actions
- [`public/docs/drive-folder-and-naming-rules.html`](public/docs/drive-folder-and-naming-rules.html) — Drive 規則
- RAG / Ask / Search API → [apps/engenie/docs/](../engenie/docs/)
