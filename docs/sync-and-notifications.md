# 資料同步與通知機制

> 本文件說明 Datasheet System 如何從 Google Sheets 同步產品資料到 Supabase，
> 以及同步後的變更通知流程。

---

## 整體架構

```
Google Sheets (各產品線)
       │
       ▼
  POST /api/sync ──────────────────┐
  (Vercel Cron 每天 09:00 自動觸發)  │
  (或 Dashboard 手動按鈕觸發)        │
       │                           │
       ▼                           ▼
  ┌─────────────┐           ┌────────────┐
  │ Smart Sync  │──skip──▶  │  結束，不拉  │
  │ 比對修改時間  │           │  資料       │
  └──────┬──────┘           └────────────┘
         │ 有變動
         ▼
  ┌─────────────┐
  │  拉取 Sheet  │  3 API calls per product line
  │  全部資料     │  (metadata + detail + overview)
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │  Deep Diff   │  逐欄比對 subtitle, full_name, overview,
  │  變更偵測     │  features, spec sections (每個 item)
  └──────┬──────┘
         │
    ┌────┴─────┐
    │ 有變更？  │
    └────┬─────┘
     No  │  Yes
     │   ▼
     │  ┌─────────────────┐
     │  │ Upsert product   │
     │  │ Replace specs    │
     │  │ Sync images      │
     │  │ Write change_log │
     │  └────────┬────────┘
     │           ▼
     │  ┌─────────────────┐
     │  │ Telegram 通知    │
     │  └─────────────────┘
     ▼
   跳過（不寫 log、不通知）
```

---

## 同步觸發方式

### 1. 自動同步（Vercel Cron）

- **時間**：每天 01:00 UTC（台灣時間 09:00）
- **設定檔**：`vercel.json`
  ```json
  { "crons": [{ "path": "/api/sync", "schedule": "0 1 * * *" }] }
  ```
- **行為**：同步所有產品線，啟用 Smart Sync（未修改的 Sheet 自動跳過）
- **授權**：Vercel Cron 自動帶 `CRON_SECRET` header

### 2. 手動同步（Dashboard 按鈕）

- **位置**：Dashboard 頁面右上角「Sync from Sheets」按鈕
- **行為**：只同步**當前選中的產品線 tab**
- **API 呼叫**：`POST /api/sync?force=true&line=Cloud%20AP`
  - `force=true`：跳過 Smart Sync，強制拉取
  - `line=Cloud AP`：只同步指定產品線
- **結果顯示**：同步完成後 alert 顯示同步數量

### 3. 單一產品同步

- **API 呼叫**：`POST /api/sync?model=ECW115`
- **用途**：開發除錯用，只同步單一 model

---

## Smart Sync 運作方式

為了避免每天全量拉取 Google Sheets（API quota 有限），系統在同步前會先檢查
Sheet 是否有被修改：

1. 呼叫 Google Drive API `files.get` 取得 `modifiedTime`
2. 比對 Supabase `product_lines.last_synced_at`
3. 如果 `modifiedTime <= last_synced_at`，跳過該產品線
4. 同步完成後，更新 `last_synced_at` 為當前時間

**注意**：
- Google Sheets 在 Shared Drive（Team Drive）中，Drive API 需要加
  `supportsAllDrives: true` 參數才能存取
- 手動按鈕帶 `force=true` 會跳過 Smart Sync 直接拉取

---

## 變更偵測（Deep Diff）

同步不是盲目覆蓋，而是先比對再決定是否寫入：

### 比對的欄位

| 類型 | 欄位 | 比對方式 |
|---|---|---|
| 產品基本資料 | subtitle, full_name, overview | 字串比對 |
| 功能列表 | features | JSON array 比對，找出新增/移除的項目 |
| 規格表 | spec_sections → spec_items | 逐 section、逐 item 比對 label + value |

### 變更紀錄格式

每次偵測到變更，會同時寫入兩種格式：

- **`changes_summary`** (text)：純文字摘要，給 Telegram 通知用
  ```
  + Feature: AI NPU detection
  - Feature: Old motion detection
  Wireless > Frequency Band: 2.4GHz → 2.4GHz/5GHz/6GHz
  ```

- **`changes_detail`** (JSONB)：結構化資料，給前端 Change Log 表格用
  ```json
  [
    { "field": "Feature", "from": null, "to": "AI NPU detection", "type": "added" },
    { "field": "Wireless > Frequency Band", "from": "2.4GHz", "to": "2.4GHz/5GHz/6GHz", "type": "modified" }
  ]
  ```

### 沒有變更時

如果比對結果完全一致（`details.length === 0`），該產品：
- 不會寫入 `change_logs`
- 不會觸發通知
- 仍算作 "synced"（出現在同步結果中）

---

## Telegram 通知

### 觸發條件

同步完成後，如果有任何產品發生實際變更（`allChanges.length > 0`），
系統會發送一則 Telegram 訊息。

### 訊息格式

```
📋 Datasheet Sync Report
2026-03-31 09:00

🔹 ECW536 (Cloud Access Points)
+ Feature: WiFi 7 support
Wireless > Max Data Rate: 2400Mbps → 5760Mbps

🔹 ECC100 (AI Cloud Cameras)
New product added
```

### 技術細節

- **Bot Token**：環境變數 `TELEGRAM_BOT_TOKEN`
- **Chat ID**：環境變數 `TELEGRAM_CHAT_ID`（可以是 group chat）
- **API**：`https://api.telegram.org/bot<token>/sendMessage`
- **字元限制**：Telegram 單則訊息上限 4096 字元，系統在 4000 字元處截斷並加 `… (truncated)`
- **不使用 HTML parse_mode**：避免特殊字元（`<`, `>`, `&`）造成解析錯誤
- **失敗不中斷**：通知失敗不會影響同步結果回傳

### 通知紀錄

成功送出通知後，會將對應的 `change_logs.notified` 設為 `true`，
避免下次重複通知。

---

## Google Sheets 資料對應

每個產品線有一個 Google Sheet，包含以下頁籤：

| 頁籤名稱 | 解析函式 | 寫入的 Supabase 表 | 前端用途 |
|---|---|---|---|
| (1) Web Overview | `parseOverviewData` | `products` | Datasheet cover page |
| (2) Detail Specs | `parseSpecSections` | `spec_sections` → `spec_items` | Datasheet specs + Compare |
| (3) Comparison | `loadComparison` | `comparisons` | /compare/[line] |
| Revision Log | `loadRevisionLogs` | `revision_logs` | /changelog/[line] |

### Web Overview 使用的欄位

| 統一後名稱 | 用途 | Supabase 欄位 |
|---|---|---|
| Model Name | 產品全名 | `products.full_name` |
| Model # | 產品編號（主鍵） | `products.model_name` |
| Single Overview | 產品描述 | `products.overview` |
| Key Feature Lists | 特色列表 | `products.features` |

> 其他欄位（Headline, Description, Product List Tag, Product Highlights）目前未使用。

---

## 常見問題

### Q: 我改了 Google Sheets，為什麼系統沒更新？

1. 自動同步每天只跑一次（09:00），可以在 Dashboard 手動按 Sync
2. 如果手動按了還是沒更新，可能是改動的欄位不在系統讀取範圍內（見上方欄位對應表）

### Q: Telegram 沒收到通知？

1. 確認 `TELEGRAM_BOT_TOKEN` 和 `TELEGRAM_CHAT_ID` 環境變數正確
2. 確認 Bot 已被加入目標群組並有發送權限
3. 如果同步結果顯示所有產品都沒有變更，就不會發送通知

### Q: 可以只同步某個 model 嗎？

可以，用 API：`POST /api/sync?model=ECW115`。但 Dashboard 按鈕目前只支援
per product line 同步。
