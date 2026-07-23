# Datasheet — Sync / Status / Images

> Extracted from CLAUDE.md 2026-06-09 to keep CLAUDE.md scannable. Read when working on Google Sheets sync, product status, or image sync.

### Google Sheets → Supabase Sync

每個產品線有一個 Google Sheet，包含 Web Overview、Detail Specs、Comparison、Revision Log 頁籤。

**Web Overview 重要欄位**：
- `Model Name` → `products.full_name`
- `Model Number` → `products.model_name` (primary key)
- `Status` → `products.status`（Active / Upcoming / Pending）
- `Single Overview` → `products.overview`
- `Key Feature Lists` → `products.features` (JSON array, 自動 strip bullet 前綴)

### Product Status

| Sheet 值 | DB 值 | Dashboard |
|---|---|---|
| 留空 / Active | `active` | 正常顯示 |
| Upcoming | `upcoming` | 琥珀色 badge |
| PVT（測試中） | `upcoming` | 琥珀色 badge（同 Upcoming） |
| Pending | `pending` | 紅色 badge（暫不發布，統一狀態） |

Dashboard 預設只顯示 Active，有 Active/All toggle。

### Sync 機制

- Vercel Cron 每天 01:00 UTC (09:00 Taiwan) → `POST /api/sync`
- Smart Sync：Drive `modifiedTime` vs `product_lines.last_synced_at`
- Dashboard Sync 按鈕只同步**當前 tab 的產品線**（`?force=true&line=Cloud+Camera`）
- Deep diff 含 status 欄位 — status-only 變更也會觸發 upsert
- **圖片同步**：即使內容無變更，若 product_image 或 hardware_image 缺失仍會從 Drive 拉取
- **PNG 自動裁透明邊**（2026-07-23，sharp `.trim()`）：PM 給的去背圖常放在巨大透明畫布上
  （SE110 產品只佔 3800×2850 畫布的 61%×24%，datasheet 上渲染變超小）。下載後自動裁掉
  透明邊再上傳 Storage；**只裁 PNG**（JPG 白邊可能是有意留白，不動）。Drive 原圖不動。
  對所有產品線生效——已緊裁的圖 trim 是 no-op
- `sheet_last_editor` fallback 到 Drive API `displayName`（Service Account 看不到 email）
- **Auto re-index after sync**：sync 完成後，對 `allChanges` 中的每個 `product_name` 呼叫 `ingestProducts({ modelName })`，自動更新 RAG 向量。`content_hash` 去重確保未變更的 chunks 被 skip。失敗隔離不中斷 sync 回應，`response.reindex` 顯示 `{processed, skipped, errors}`

### Image 雙向同步 (locale-aware)

```
Drive 真源 (authoritative)          Supabase (快取)          前端
─────────────────────────            ────────────           ─────
Cloud AP/DS Images/    ──(sync)──▶  images/<model>/...  ──▶  products.product_image
                       ──(sync)──▶                      ──▶  products.hardware_image
Cloud AP_ja/DS Images/ ──(sync)──▶  images/<model>/..._ja ▶  product_translations.hardware_image (locale=ja)
Cloud AP_zh/DS Images/ ──(sync)──▶  images/<model>/..._zh ▶  product_translations.hardware_image (locale=zh-TW)

MKT web upload (任一語言) ──write-through──▶ Supabase + 對應語言的 Drive DS Images
```

- **檔名**：英文 `{Model}_{type}.{ext}`；語言版 `{Model}_hardware_{locale}.{ext}`（只有 hardware 有語言變體；product 圖和 Radio Pattern 跨語言共用）
- **Drive 資料夾**：每個 product line 有對應的 `<lineName>_<locale>` 兄弟資料夾。語言版的 `DS Images/` 子資料夾如果缺失，`resolveLocaleDsImagesFolder()` 會自動建立。語言版的 product line 資料夾必須 PM 事先建好（`Cloud AP_ja`），不會自動建
- **寫入路徑**：`/api/upload-image` 收到 locale 參數 → `resolveLocaleDsImagesFolder` walk up EN 資料夾 → Model Datasheet root → 找 `<line>_<locale>` → 找 / 建 `DS Images/` 子資料夾 → 上傳
- **同步路徑**：`syncLocalizedHardwareImage()` 在 sync cron 針對每個啟用的 locale 各跑一次，寫入 `product_translations.hardware_image`
- **Locale 代碼**：`ja` 和 `zh`（zh-TW 簡寫），統一用 ISO 639-1 語言代碼。舊的 `_jp` / `_JP` 已在 2026-04-15 透過 `scripts/rename-jp-to-ja.mjs` 全面改名
- Drive 上傳失敗不影響 Supabase（non-blocking）
