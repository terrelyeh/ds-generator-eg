# CLAUDE.md — Product SpecHub (apps/spechub)

> Last updated: 2026-08-13。Monorepo 拆分完成（Phase 1–5, 2026-06-13 cutover;剩
> 藍圖 §6 登入驗收、repo rename 兩件手動收尾,見
> [`docs/monorepo-split-plan.md`](docs/monorepo-split-plan.md)）。RAG/Ask/Knowledge 全在
> **apps/engenie**;共用碼在 packages `@eg/db` / `@eg/auth` / **`@eg/llm`**。
> RAG/Ask 的事去看 [apps/engenie/CLAUDE.md](../engenie/CLAUDE.md)。
> **近期（2026-08-06~07）：西文 es-MX 上線 + 翻譯行數預算 + LLM 全面走 OpenRouter
> + 花費帳本 + 翻譯審核流程。這四塊互相咬合，動之前先讀
> [`docs/spanish-openrouter-review.md`](docs/spanish-openrouter-review.md)** ——
> 裡面有三個「看起來多餘、其實不能拆」的設計，以及行數預算為何不能用字數比例。
> **2026-08-12~13：四種版型的字型/字級系統整併**（Manrope 標題 + Roboto 內文 + CSS
> 條列圓點 + 共用 `scale.ts` 刻度 + 規格頁分區間距/分頁 guard + logo 換新 ®）——
> 細節在下方 Brand & Visual System 與 pitfall #50。

## Project Overview

**Product SpecHub** — EnGenius 產品規格管理與 Datasheet 自動化系統。
從 Google Sheets 同步產品資料到 Supabase，前端提供 Dashboard 管理、
Spec Comparison、Change Log，並能生成 PDF Datasheet（多語言）。

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
- **Page guard pattern**: server component 開頭 `await adminOnly()` / `await requirePagePermission("xxx")`
- **UI hide pattern**: layout/page 拿 role → client component 用 `can(role, "permission")` 包按鈕。三層 gate 都要做
- **Supabase write error checking**: 所有 write 都要看 `error`，用 `throwIfDbError(label)(res)`（pitfall #45）
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

- Vercel 自動部署 main branch；Cron: `/api/sync` 每天 09:00 台灣時間
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

> Pitfalls #1–#44, #46–#49, #51–#53, #59, #64, #65, #66, #67 archived to [`docs/common-pitfalls.md`](docs/common-pitfalls.md)。
> #54–#58（RAG/聊天相關）搬到 [apps/engenie/CLAUDE.md](../engenie/CLAUDE.md)。

45. **Supabase silent insert/update 是這個系統最久的雷** — supabase-js 的 write 不 throw on
    error，回 `{ data, error }`。歷史教訓：`versions` unique constraint 漏 locale → INSERT 撞
    dup key → silent fail → UI 顯示假狀態。慣例：所有 write 一律 `throwIfDbError(label)(res)`。


50. **Pagination 常數一定要對齊實際 CSS** — `AVAILABLE_HEIGHT = 792 - TOP_BAR - SPEC_TITLE -
    BOTTOM_MARGIN`；SPEC_TITLE_HEIGHT 62pt、SPEC_BASE_ROW_HEIGHT 23pt、
    **CATEGORY_HEADER_HEIGHT 18pt + SECTION_GAP 12pt**（2026-08-13 拆開:分類條高度與「分區之間」
    的間距是兩回事,SECTION_GAP 不套用在每欄第一個分區,合成一個數字會每欄高估 12pt）；
    **CJK row metrics 更大**（JA 24pt / zh-TW 25pt）。`splitIntoPages(sections, locale)` 必須傳
    locale。每改 preview CSS 必須同步檢查這些常數。
    ⚠️ **規格頁分區間距放在 `.spec-col > div + div`,不是分類條上**（2026-08-13）—— 每個分區是自己的
    wrapper div,所以灰色分類條全都是 `:first-child`,`.spec-category-header:first-child{margin-top:0}`
    會把**所有**分區的上緣間距清成 0（原本 CSS 寫的 6pt 從沒生效過,分類條一直貼著上一區最後一列）。
    最後一列另用 `.spec-row:last-child{border:none}` 去掉懸空的底線。
    ⚠️ **`splitIntoPages` 的 force-fit 分支會塞爆欄位** —— 欄位空但 section 過高時硬塞（防無限迴圈）,
    塞完原本沒人檢查 → 內容印出紙外。已加 `HARD_COLUMN_LIMIT`（= AVAILABLE + 大部分 BOTTOM_MARGIN,
    留 30pt 給頁碼）事後把超出的 section 擠到下一頁;順序要注意:**左欄溢出得連右欄一起擠**,否則規格
    會亂序。`balanceColumns` 的防溢版只在「沒有 section 被切開」時跑,擋不到 force-fit 這條路徑。


60. **`products.product_image` / `hardware_image` 是 `NOT NULL DEFAULT ''`** —— sync 的
    「Drive 檔案已刪 → 清空 DB」分支曾寫入 `null`，觸發 23502 但 supabase-js 只回
    `{error}` 不 throw（pitfall #45 同源），整句 update 靜默失效 —— 連同一句裡的
    `sheet_last_modified/editor` 也一起沒寫進去。要清空請寫 `""`。
    推論法則：**空字串 = 從沒填過**（欄位 default），不是「被清掉」。
    （2026-07-24 補：`/api/upload-image` 的 DELETE 也踩同一坑 —— 刪圖時 Storage/Drive
    有刪、DB 沒清，等於「刪除圖片」功能一直半殘。已一併改成寫 `""`；
    `product_translations.hardware_image` 本身 nullable，那裡維持 `null` 才對。）


61. **「依 category 而異」的判斷不要各元件各寫一份** — 同一個特性散在
    preview/[model]、product-detail、dashboard-content 三處，結果 Data Center 上線後
    ① 內頁 QR 卡片只認 `isTransceiver`，DC 線落到 `qr.engenius.ai/qsg/{model}`（不存在的頁），
    但 datasheet 印的是 Contact Us —— **兩個畫面對同一台機器講不同的話**；
    ② dashboard 的 `isAP` 用 **`category.toLowerCase().includes("ap")`**，
    `"Edge Network Appliances"` 的 **Appli-ap-ances** 命中 → 長出 Radio Pattern 欄位
    （另外兩處都是 `=== "APs"`）。**子字串比對 category 是地雷，一律精確比對**。
    現已集中在 **`lib/datasheet/qr.ts`**（`usesContactUsQr` / `usesTwoHardwareImages`），
    新增這類特性請加在那裡，不要在元件內就地判斷。
    （2026-07-30 補：**Cloud 模板自己的 QR 是最後一個沒收編的**——`preview/[model]/page.tsx`
    還留著本地的 `isTransceiver` 判斷，所以把 category 加進 `CONTACT_US_CATEGORIES`
    只改到產品頁、datasheet 依然印 `/qsg/`。Station Outdoor 上線時就中這招:兩個畫面
    又對同一台機器講不同的話,而且指向一個不存在的頁。已改吃 `usesContactUsQr()`,
    現在加進那個 Set 就真的兩邊都生效。）


62. **`(main)` 群組的頁面 headless 驗不了** — dashboard / product 內頁受白名單 gate
    （`(main)/layout.tsx` 的 `getCurrentUser()`），帶 `x-vercel-protection-bypass` 也只過
    proxy、仍會 307 到 `/auth/no-access`。**只有 `(print)/preview/*` 能用 bypass 直接抓**。
    所以動到 dashboard/內頁時：typecheck+build 之外，要推 branch preview 請使用者點過再 merge。


63. **新做自訂版型時最容易漏掉多語言**（2026-07-24 EOC610 ja 事件）—— Broadband
    與 Data Center 兩個組件都寫死 `getDict("en")` / `locale="en"`,而且
    `page.tsx` 的翻譯載入區塊原本在**版型分派之後**,那兩個分支 early return
    根本跑不到。症狀:日文 preview 出英文、Generate 產出英文版又卡在英文硬體圖缺。
    新增版型組件時**必收 `locale` + `translation` 兩個 prop**,並且:
    ① 標題走 `dict` 不要寫字串;② 硬體圖優先用該語系的（callout 印在圖裡）;
    ③ `PrintToolbar` 要收真 locale + `translationConfirmed`;④ `canGenerate`
    讀「該語系實際渲染的值」(同 pitfall #59,已歸檔於 [`docs/common-pitfalls.md`](docs/common-pitfalls.md))。


69. **版面驗證最容易「假綠」—— 檢查器要先證明自己看得到東西**（2026-08-12 型級收斂時
    連踩兩次）。兩個獨立的成因,都讓 109 份文件回報「0 溢版」而其實什麼都沒驗到:
    ① **`.page` 是 `overflow: hidden`,所以 `scrollHeight` 永遠等於 `clientHeight`** ——
    用它判斷溢版永遠回 false。要比對子元素的 `getBoundingClientRect().bottom` 有沒有
    超過 page 的 bottom。
    ② **`rm -rf .next` 之後 dev server 被「reused」會吐出 0 頁的空白頁面** ——
    而「0 頁」當然不會溢版,檢查器一片綠。跑批次驗證前先確認伺服器真的在吐頁面
    （`curl ... | grep -c 'class="page"'`）,並且把「after 頁數 = 0」本身當成失敗條件。
    **通則:任何「沒發現問題」的檢查,要先能證明它在有問題時會叫。** 今天兩支
    guard（off-scale、CJK 漂移）都是先故意種一個錯、看它報錯,才算數。

67. **翻譯陣列（features / spec_labels）不會跟著英文縮短,尾巴 UI 看不見卻會印進 PDF** —
    新增「陣列長度跟著另一個陣列走」的欄位時,**讀取端和寫入端都要對齊來源長度**
    （編輯器 `alignToSource()` + `/api/translations/product` 伺服端截齊,不依賴呼叫端）。
    全文（ECP106 zh-TW 事件）見 [`docs/common-pitfalls.md`](docs/common-pitfalls.md)。

66. **圖片尺寸要由「框」決定,不是由檔案的像素數決定** — `max-width`/`max-height`
    只封頂不放大,所以渲染尺寸會變成「PNG 像素數說了算」。封面產品圖、hardware 圖、
    Cloud AP 天線圖三處都中過,而且 `sharp.trim()` 裁掉透明邊後會同時改寫像素數**和長寬比**,
    把「太小」盪成「太大」。**留白一直在無意間當縮放控制。**
    修法一律是 `width/height:100% + object-fit:contain`,框用參考稿量到的尺寸。
    **改共用版面 CSS 前先用 `pymupdf` 量 InDesign 原稿。**
    全文（含三次事故的實測數字與 row/column gap 算式）見
    [`docs/common-pitfalls.md`](docs/common-pitfalls.md)。

64. **CJK 字型要在 CSS 指名、產 PDF 前主動載入** — `font-family` 只寫 Roboto/Manrope
    沒有 CJK 字符,而 `document.fonts.ready` 不夠（Google Fonts CJK 是數百個 lazy
    unicode-range 分片）。route 用 `waitForFonts(page)` 對 `body.innerText` 逼出分片。
    **新版型組件務必把 locale 的 CJK 字型放進 font-family 最前面**（`cjkFontFor`）。
    ⚠️ **本機有 PingFang TC 會 fallback,這 bug 本地永遠重現不了** —— Vercel 缺字印成
    `\x00`。全文（EOC610 ja 事件）見 [`docs/common-pitfalls.md`](docs/common-pitfalls.md)。

68. **「是不是 CJK」不要用「有沒有 TYPOGRAPHY_DEFAULTS」來推導**（2026-08-06 加 es 時發現）——
    `cjkFontFor()` 原本寫 `const defaults = TYPOGRAPHY_DEFAULTS[locale]; if (!defaults) return null;`。
    在只有 ja / zh-TW 的世界裡「有 defaults」和「是 CJK」是同一件事,所以看不出問題。
    加西文時如果照舊 recipe 補上 `TYPOGRAPHY_DEFAULTS.es`,`cjkFontFor("es")` 就會回
    Roboto,被塞到 **Data Center 版型的 Manrope 前面**,整份 DC 西文 datasheet 悄悄換字體。
    **同一類錯誤的第三次**（#61 用子字串比對 category、#63 版型寫死 locale）——
    現在改成明確的 `CJK_LOCALES` set + `isCjkLocale()`,`preview/[model]`、
    `typography-editor`、typography API 三處共用。
    ⚠️ **原本的衍生規則已於 2026-08-10 作廢**。當時寫「拉丁語系不要有 defaults entry、
    不要出現在設定頁」,現在 en / es **兩者都有了** —— 而且是安全的,正因為這條 pitfall
    的修法（明確 set 而非推導)已經就位。真正的規則是:
    **`TYPOGRAPHY_DEFAULTS` 有沒有某語系 ≠ 那個語系是不是 CJK**,兩件事各自判斷。
    設定頁的語系清單現在從 `TYPOGRAPHY_DEFAULTS` 推導,所以「設定頁列出它」⇔
    「算繪端真的會讀它」,不會再出現按了 Save 卻沒作用的面板。
    **行高／內文色／頁尾樣式刻意不進設定頁** —— 那三項跟著文字系統走（拉丁 vs CJK）,
    由 `preview/[model]` 依 `isCjkLocale()` 挑。開放成可依語系設定 = 有人能把西文
    設成 CJK 行距 = 封面破版。

## 詳細文件

- [`docs/monorepo-split-plan.md`](docs/monorepo-split-plan.md) — 拆分藍圖（歸屬/階段/驗收/回滾）
- [`docs/file-structure.md`](docs/file-structure.md) — 完整檔案地圖 + 放東西的規則
- [`docs/schema.md`](docs/schema.md) — DB schema:關係圖、擁有權、各表欄位語意
- [`docs/common-pitfalls.md`](docs/common-pitfalls.md) — Pitfalls archive（#1–#42 及後續歸檔的 #59 / #64 / #65 / #66 / #67）
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
