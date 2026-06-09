# Datasheet — PDF / Layout / Multi-Language Rendering

> Extracted from CLAUDE.md 2026-06-09 to keep CLAUDE.md scannable. Read when touching PDF generation, cover/spec layout (lib/datasheet/), or translated datasheets.

### PDF Generation

- **Regenerate**（預設）：覆蓋當前版本 PDF，更新 versions 表同一筆記錄
- **New Version**：minor +1（1.4→1.5），新建 versions 記錄
- 前置條件檢查：Product Image + Hardware Image + Overview + Features 都齊全才能 Generate
- Preview toolbar 和 Model page 都有相同的 Regenerate/New Version 選項
- 版本偵測支援三層結構（Camera 用）：`DS_Cloud_ECC100/DS_Cloud_ECC100_v1.1/xxx.pdf`
- **多語言 PDF**：`/api/generate-pdf?model=X&lang=ja&mode=new`，每語言獨立版本號
- **Drive folder auto-create**：`uploadPdfToDrive` 透過 `resolveLocaleLineFolder()` 自動建立缺失的 sibling locale line folder（`Cloud Camera_zh`）。容忍 PM typo（`_zh-TW`、`_ZH`、`_jp` 等），找到任何一個就用 + warn
- **Legacy folder migration**：找不到 canonical 的 `DS_Cloud_<model>_<suffix>` 時，會搜尋 legacy `_v<X>.<Y>` 後綴版本，把最高版號那個 rename 成 canonical，舊 PDF 留在裡面。EN/locale 雙路徑都生效
- **Drive overwrite + dedupe**：同名 PDF 找到就 update content + trash 多餘重複（非 hard delete — Shared Drive 通常 `canTrash=true canDelete=false`，hard delete 會 404）
- **Locale Draft 阻擋**：`product_translations.confirmed = false` 時 API 回 409；UI 也擋（顯示「⚠️ Translation in Draft」黃字警告）
- **Role gating**：PM/Viewer 角色看 preview link 時，Regenerate 按鈕整塊隱藏，顯示「Preview only · PM」
- **Puppeteer 自我認證**：`/api/generate-pdf` 內部的 Puppeteer 會 fetch 自己的 `/preview/[model]`，proxy 看 `x-vercel-protection-bypass` header（已存在的 `VERCEL_AUTOMATION_BYPASS_SECRET` env var）放行，否則 Puppeteer 會抓到 sign-in 頁印成 PDF
- **UX**：PDF gen 全部用 `toast.loading` → `toast.success` with `Open PDF` action button（不直接 `window.open`，因為 popup blocker 會擋 async-after window.open）
- **Resync versions from Drive**（Dashboard `Sync ▾` 第三個選項）：daily sync 只看 Sheet 內容 + 圖片，不掃 Drive 版本。PM 手動動 Drive PDF / generate-pdf 半途失敗時 DB 版號會落後。這顆按鈕對當前 tab 的每個 model 跑 `detectLatestVersion()` 把 DB 拉到跟 Drive 一致。`gate("sync.run")` 開放 admin+editor，當前只處理 EN 版號（未來可延伸 per-locale）

### Datasheet Layout System（`lib/datasheet/`）

Cover page 用 **動態版面**：features 依內容高度浮動（max 320pt），overview 吃剩下空間。Spec 自動 2 欄分頁 + 跨欄 mid-item split。所有估算 **locale-aware** — CJK metrics 不同於 EN。

- **`cover-layout.ts`** — `estimateCoverLayout()` + `balanceFeatureColumns()`（**balanced column-first**：順序填左欄到 ~總高一半，剩下進右欄。保留閱讀順序又接近視覺平衡。舊的 greedy height-balance 已棄用 — 會交錯 1,3,5 / 2,4,6 破壞優先順序）。`LOCALE_METRICS` 表保存每 locale 的 `overviewCharsPerLine` / `featureCharsPerLine` / `overviewLineHeightPt` / `featureLineHeightPt` / `itemMarginPt` / `coverGapPt`。**features 字比 overview 小**（EN 10/11pt, JA 10.5/11.5pt, zh 11/12pt），兩個 line-height 必須分開估算。CJK 把 `coverGapPt` 從 20pt 降到 10pt 買回空間
- **`pagination.ts`** — spec 分頁。常數必須跟 `preview/[model]/page.tsx` 的 CSS 對齊：`TOP_BAR_HEIGHT=22`（CSS 21.4pt）、`SPEC_TITLE_HEIGHT=62`（27pt padding-top + 16.8pt 行高 + 18pt margin-bottom）、`CATEGORY_HEADER_HEIGHT=22`（7.5pt 字 + padding 5pt + margin 8pt）、`BOTTOM_MARGIN=72`（1 inch 安全 buffer）。`AVAILABLE_HEIGHT = 792 - 22 - 62 - 72 = 636pt`。**Row metrics 是 locale-aware**：`LOCALE_ROW_METRICS` 表 EN baseRowHeight 23/lineExtra 10、JA 24/11、zh-TW 25/12 — CJK 字型 intrinsic leading 較大（~1.3 vs ~1.2）所以每行多 1-2pt。常數低估會讓 fitSection 以為還有空間實際塞爆 → 內容貼頁碼。每改 CSS 必須同步檢查這些常數（pitfall #50）
- **`fitSection(allowForceFit)`** 只有空欄才能 force-fit（避免把尾巴 orphan 到新頁）。跨欄/跨頁用 `isContinuation` flag，renderer skip 重複 category header（不是拼 "(cont.)" 字串）。partial-split 分支必須 set `splitOccurred = true`，否則尾端 `balanceColumns` 會把好的版面覆寫掉（pitfall #51）
- **`balanceColumns()`**（單頁美化重排）用**高度**不是 item 數選 split index — 枚舉所有切點挑 `|leftH - rightH|` + 溢位 penalty 最小者。原本 count-based 在 features 長度差異大時會爆（ESG 案例：19/17 items 看似平均但右欄高度 760pt > 可用 657pt）
- **`layout-check.ts`** — 二元綠/紅燈（丟掉 amber）。`checkProductLayout({ overview, features, spec_sections, locale })` 接 locale 選擇 metrics。Overview overflow 判斷加 12pt safety buffer（避免估算 `wanted=145pt vs available=146pt` 剛好擠進去但實際 rendering 微差就被截）
- **`layout-ack.ts`** — `products.layout_ack` JSONB，格式 `{ en: { acked: true, hash: "..." }, ja: ... }`。`computeContentHash(overview, features)` 產 16-char sha256；`isAckValid(ack, currentHash)` 比對。內容一改 hash mismatch → ack 自動失效，紅燈回來。Legacy `true` 向後相容（永遠視為有效）
- **Layout warning UI**（`components/product/product-detail.tsx`）：`LayoutWarningBanner` 顯示 overflow + "Mark as Reviewed OK"；ack valid 時改顯示 `LayoutAckedNotice` 綠色細條 + Undo 按鈕。每 locale 獨立 banner
- **空翻譯不檢查**：dashboard + product detail 在跑 per-locale layout check 前，先看 `t.overview` 和 `t.features` 是否都是 null/空。都空就 skip — 否則 EN fallback 內容被 CJK metrics 量到會假性紅燈
- **Antennas Patterns 頁**（AP only）：`preview/[model]/page.tsx` 額外渲染一頁 polar plot grid，位於 spec pages 和 hardware overview 之間。偵測條件：`product_line.category === "APs"` 且有上傳任何 radio_pattern image。6GHz slots 由 Operating Frequency spec 含 `6 GHz` 自動加入。`.antenna-image img` 用**顯式 `width: 158pt; height: 158pt`**（has-6g 縮為 125pt），不用 max-width — 見 Common Pitfalls #31
- **Spec footnote**（per-product-line, optional）：`product_lines.spec_footnote` (EN) + `spec_footnote_translations` (JSONB) 設定後，會在**最後一個 spec page** 的兩欄下方渲染（左對齊、6.5pt 灰字 + 頂部細線分隔）。VPN Firewall 用來標註效能數據是估計值。其他產品線 NULL 就不顯示。不需動 code，純 SQL 設定。Locale 解析：`translations[lang]` → EN fallback → 不顯示

### Multi-Language Datasheet

完整規則詳見 [`/docs/drive-folder-and-naming-rules.html#s9`](public/docs/drive-folder-and-naming-rules.html)。

**架構要點**：
- 翻譯分兩層：per-product（`product_translations`：headline/subtitle/overview/features/HW image/QR）+ per-product-line（`spec_label_translations`：spec labels 共用）
- 兩種模式：**Light**（只翻標題+內容）vs **Full**（+規格表 label）
- **Draft / Confirmed 流程**：Enable → 翻譯 → Preview（auto-save 為 Draft）→ Save & Confirm → Generate PDF。Save & Confirm 按鈕條件是「有內容 AND (Draft OR dirty)」— Draft 狀態下永遠可按避免使用者按 Preview 後卡死。Draft 時按鈕用 amber + pulse 動畫強調。Preview 對 Draft locale 跳 toast 提醒「請按 Save & Confirm」（pitfall #49）
- 版本獨立：`products.current_versions` JSONB 存各語言版本（`{"en":"1.1","ja":"1.0"}`）
- Drive 資料夾：PDF 在 `<lineName>_<locale>/DS_Cloud_<model>_<locale>/`，圖片在 `<lineName>_<locale>/DS Images/{model}_hardware_<locale>.ext`（`getLocaleSuffix()` 負責 zh-TW → zh 映射；日文統一用 `ja`，舊的 `_jp` 命名已於 2026-04-15 全部改掉）
- Headline 支援 `**粗體**` markdown → 渲染為 `<strong>`（`parseHeadlineMarkup()` in preview）
- CJK 排版：shared base（禁則處理+justify）+ per-locale CSS 動態從 DB 讀取（`typography_${lang}` in `app_settings`）
- **Typography Settings**（`/settings/typography`）：字型選擇（Google Fonts）+ 字級/字重/顏色 per-locale，split layout 左設定右 preview
- 自定義 Google Font：貼 URL 自動解析（`parseGoogleFontUrl()`），存 `app_settings` as `custom_fonts_${locale}`

**AI 翻譯系統**：
- 5 層 Prompt：base → locale → product-line → content-type → glossary（from DB）
- 多 provider：Claude Sonnet/Opus、GPT-4o、Gemini 2.5 Pro
- API Key 優先順序：`app_settings` DB 表 > env var
- 回傳 JSON `{ translated, notes }` — notes 用繁中說明做了什麼優化
- `translation_glossary` 表存公司詞庫，scope 分 global 和 per-product-line
- 新增產品線 prompt：在 `src/lib/translate/prompts/product-lines/` 加檔案 + 在 `index.ts` 的 `productLinePrompts` 註冊
