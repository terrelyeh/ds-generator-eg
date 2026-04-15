# Product SpecHub — Google Drive 資料夾結構與命名規則

> 版本: 2026-04-15 | 維護者: Terrel Yeh

> **2026-04-15 更新**: 圖片多語言資料夾結構對齊。每個語言的 hardware 圖現在存放在對應語言產品線底下的 `DS Images/`（如 `Cloud Camera_ja/DS Images/`），不再放在英文 `DS Images/` 裡。所有 Drive 上的日文後綴也從 `_jp` / `_JP` 統一為 `_ja`。

---

## 1. 產品線總覽

系統目前支援 **7 個產品線**，分為兩大 Solution：

| # | 產品線 | Dashboard 標籤 | Solution | DS Prefix | 佈景主題 |
|---|--------|---------------|----------|-----------|---------|
| 1 | Cloud AP | Cloud AP | Cloud | `DS_Cloud` | 藍色 |
| 2 | Cloud Switch | Cloud SW | Cloud | `DS_Cloud` | 藍色 |
| 3 | Cloud Camera | Cloud Camera | Cloud | `DS_Cloud` | 藍色 |
| 4 | Cloud AI-NVS | Cloud NVS | Cloud | `DS_Cloud` | 藍色 |
| 5 | Cloud VPN Firewall | Cloud VPN FW | Cloud | `DS_Cloud` | 藍色 |
| 6 | Switch Extender | Extender | Cloud | `DS_Cloud` | 藍色 |
| 7 | Unmanaged Switch | Unmgd SW | Unmanaged | `DS_Unmanaged` | 灰色 |

> **佈景主題說明**: Cloud Solution 使用 EnGenius 藍色主題 (`#03a9f4`)，Unmanaged 使用灰色主題 (`#58595B`)。

---

## 2. Google Drive 資料夾結構

### 2.1 總體架構

每個產品線在 Google Drive 上是一個獨立的資料夾，裡面同時存放 Datasheet PDF 和產品圖片。多語言版本是**獨立的 top-level 兄弟資料夾**，用 `_ja` / `_zh` 後綴區分：

```
Model Datasheet/
├── Cloud AP/                          ← 🇺🇸 英文產品線 (drive_folder_id)
│   ├── DS Images/                     ← 產品圖片 (ds_images_folder_id)
│   │   ├── ECW526_product.png
│   │   ├── ECW526_hardware.png
│   │   └── ECW526_2.4G_H-plane.png
│   ├── DS_Cloud_ECW526/               ← PDF 子資料夾
│   │   ├── DS_Cloud_ECW526_v1.3.pdf
│   │   └── DS_Cloud_ECW526_v1.4.pdf
│   └── ...
│
├── Cloud AP_ja/                       ← 🇯🇵 日文產品線
│   ├── DS Images/                     ← 日文 hardware 圖
│   │   └── ECW526_hardware_ja.png
│   └── DS_Cloud_ECW526_ja/
│       └── DS_Cloud_ECW526_v1.0_ja.pdf
│
├── Cloud AP_zh/                       ← 🇹🇼 繁中產品線
│   ├── DS Images/
│   │   └── ECW526_hardware_zh.png
│   └── DS_Cloud_ECW526_zh/
│
├── Cloud Switch/
├── Cloud Camera/
├── Cloud Camera_ja/
├── Cloud Camera_zh/
└── ...
```

**重點**：產品圖片的 `DS Images/` 是每個產品線資料夾**裡面的子資料夾**，不是 top-level 資料夾。若語言版本的產品線下還沒有 `DS Images/` 子資料夾，系統首次上傳或同步時會**自動建立**。

### 2.2 共用資料夾

> **注意**: Extender 和 Unmanaged Switch 因為型號較少，與 Cloud Switch 共用同一個產品線資料夾（包含其中的 DS Images）。

| 產品線 | 英文版資料夾 | 日文版 | 繁中版 |
|--------|------------|--------|--------|
| Cloud AP | `Cloud AP/` | `Cloud AP_ja/` | `Cloud AP_zh/` |
| Cloud Switch | `Cloud Switch/` | `Cloud Switch_ja/` | `Cloud Switch_zh/` |
| Cloud Camera | `Cloud Camera/` | `Cloud Camera_ja/` | `Cloud Camera_zh/` |
| Cloud AI-NVS | `Cloud NVS/` | `Cloud NVS_ja/` | `Cloud NVS_zh/` |
| Cloud VPN Firewall | `Cloud VPN FW/` | `Cloud VPN FW_ja/` | `Cloud VPN FW_zh/` |
| **Extender** | **Cloud Switch/** 系列共用 | — | — |
| **Unmanaged Switch** | **Cloud Switch/** 系列共用 | — | — |

每個產品線資料夾裡面都有一個命名固定的 `DS Images/` 子資料夾。系統查找語言版本資料夾時，會從 EN 資料夾 walk up 到 `Model Datasheet/` 根目錄，再往下找 `<lineName>_<locale>` 的兄弟資料夾。

---

## 3. Datasheet PDF 命名規則

### 3.1 子資料夾命名

每個型號在 DS 資料夾內有一個子資料夾：

```
{DS_Prefix}_{Model}/
```

**範例**:
- `DS_Cloud_ECW526/`
- `DS_Cloud_ECS5512FP/`
- `DS_Cloud_ECC500/`
- `DS_Cloud_ESG510/`
- `DS_Cloud_EVS1004D/`
- `DS_Cloud_EXT1106/`
- `DS_Unmanaged_ES105/`

> **歷史格式**: 部分舊資料夾名稱包含版本號（如 `DS_Cloud_ECW526_v1.4/`），系統可自動辨識。新建的資料夾一律不帶版本號。

### 3.2 PDF 檔案命名

```
{DS_Prefix}_{Model}_v{Major}.{Minor}.pdf
```

**範例**:
- `DS_Cloud_ECW526_v1.4.pdf`
- `DS_Cloud_ECS5512FP_v1.5.pdf`
- `DS_Unmanaged_ES105_v1.0.pdf`

### 3.3 版本規則

| 規則 | 說明 |
|------|------|
| 格式 | `v{Major}.{Minor}` (例: `v1.4`) |
| 新產品 | 從 `v1.0` 開始 |
| 更新 | Minor 版本 +1 (例: `v1.4` → `v1.5`) |
| 版本來源 | 系統自動掃描 DS 資料夾中的 PDF 檔名，取最新版本 |

**版本偵測邏輯**:
1. 掃描型號對應的子資料夾
2. 檢查資料夾名稱中的版本號（舊格式）
3. 檢查資料夾內所有 PDF 檔名中的版本號
4. 取最大版本號作為 base version
5. 生成新 PDF 時自動 +1

---

## 4. 產品圖片命名規則 (DS Images)

### 4.1 檔案命名格式

```
{Model}_{type}.{ext}                      ← 英文版
{Model}_{type}_{locale}.{ext}             ← 多語言版（僅 hardware）
```

| 圖片類型 | type 名稱 | 說明 | 範例 |
|----------|----------|------|------|
| 產品照 | `product` | 跨語言共用 | `ECW526_product.png` |
| 硬體標示圖 (英文) | `hardware` | 英文標註 | `ECW526_hardware.png` |
| 硬體標示圖 (日文) | `hardware_ja` | 日文標註 | `ECW526_hardware_ja.png` |
| 硬體標示圖 (繁中) | `hardware_zh` | 繁中標註 | `ECW526_hardware_zh.png` |
| Radio Pattern | `{Band}_{Plane}` | AP 專用，跨語言共用 | `ECW526_2.4G_H-plane.png` |

**跨語言共用 vs 各語言獨立**：
- **Product 圖**和 **Radio Pattern** 只有一份（英文版），跨語言共用，放在英文產品線的 `DS Images/`
- **Hardware 圖**可以每個語言獨立（因為圖上的 LED / Port 標註文字不同），放在對應語言產品線的 `DS Images/`

### 4.2 支援的副檔名

系統同時搜尋 `.png` 和 `.jpg`，優先使用 `.png`。

### 4.3 Radio Pattern (僅 AP 產品線)

AP 產品需要提供各頻段的天線輻射圖：

```
{Model}_{Band}_{Plane}.png
```

**範例**:
- `ECW526_2.4G_H-plane.png`
- `ECW526_2.4G_E-plane.png`
- `ECW526_5G_H-plane.png`
- `ECW526_5G_E-plane.png`
- `ECW536_6G_H-plane.png` (Wi-Fi 6E 機種)

### 4.4 完整範例

```
Cloud AP/DS Images/                  ← 🇺🇸 英文版產品線底下
├── ECW526_product.png               ← 產品照（跨語言共用）
├── ECW526_hardware.png              ← 英文硬體圖
├── ECW526_2.4G_H-plane.png          ← Radio Pattern（跨語言共用）
├── ECW526_2.4G_E-plane.png
├── ECW526_5G_H-plane.png
└── ...

Cloud AP_ja/DS Images/               ← 🇯🇵 日文版產品線底下
└── ECW526_hardware_ja.png           ← 日文硬體圖（檔名帶 _ja 後綴）

Cloud AP_zh/DS Images/               ← 🇹🇼 繁中版產品線底下
└── ECW526_hardware_zh.png           ← 繁中硬體圖

Cloud Switch/DS Images/
├── ECS5512FP_product.png
├── ECS5512FP_hardware.png
├── EXT1106_product.png              ← Extender 也放在這裡
├── EXT1106_hardware.png
├── ES105_product.png                ← Unmanaged 也放在這裡
├── ES105_hardware.png
└── ...
```

### 4.5 為什麼檔名還要帶 `_ja` / `_zh` 後綴？

雖然語言版的 hardware 圖已經放在對應語言的 `DS Images/` 裡，檔名後綴仍然保留是為了：

1. 避免 Supabase Storage 路徑撞車（Storage 是 flat key，沒有 locale 目錄）
2. 檔案被下載或轉寄時仍能自我識別
3. 跟 PDF 檔名 `DS_Cloud_ECW526_v1.0_ja.pdf` 的命名慣例對齊
4. 防呆：如果誤把 `_ja` 檔放到 `_zh` 資料夾，sync 可以偵測錯誤

---

## 5. Google Sheets 規格表結構

每個產品線有一個 Google Sheet，包含以下頁籤：

| 頁籤 | 用途 | 資料流向 |
|------|------|---------|
| Web Overview | 產品名稱、Headline、Overview、Features、**Status** | → Supabase `products` 表 |
| Detail Specs | 技術規格 (各 category) | → Supabase `spec_sections` + `spec_items` |
| Comparison | 產品比較表 | → Supabase `comparisons` |
| Revision Log | 變更紀錄 | → Supabase `revision_logs` |

### 5.1 Web Overview 必要欄位

| Row (Column A) | 說明 | 範例值 |
|----------------|------|--------|
| `Model Name` | 產品全名 | Cloud Managed AI Wi-Fi 6 2x2 Indoor Access Point |
| `Model Number` | 型號 (系統 primary key) | ECW526 |
| **`Status`** | **產品狀態** | `Active` / `Upcoming` / `Pending` |
| `Headline` | 一行標語 | High-Performance Tri-Band Wi-Fi 6E Access Point |
| `Description` | 描述 (舊) | ... |
| `Single Overview` | 單一段落 Overview (優先使用) | ... |
| `Key Feature Lists` | 條列式功能 (換行分隔) | ... |

### 5.2 產品狀態 (Status)

| Google Sheet 填寫 | 系統狀態 | Dashboard 顯示 | 說明 |
|-------------------|---------|---------------|------|
| 留空 或 `Active` | `active` | 正常顯示 (無標籤) | 在售產品，會被列入 Datasheet 生成 |
| `Upcoming` | `upcoming` | 琥珀色 **Upcoming** 標籤 | 即將上市，規格表已建立但尚未正式發布 |
| `Pending` | `pending` | 紅色 **Pending** 標籤 | 暫不發布 (停產/問題/評估中，統一用此狀態) |

> Dashboard 預設只顯示 **Active** 產品，點右上角「Active / All」按鈕可切換。

---

## 6. 目前所有產品型號一覽

### Cloud AP (25 models)
| 型號 | 版本 | 狀態 |
|------|------|------|
| ECW115 | v1.1 | Active |
| ECW120 | v1.1 | Active |
| ECW130 | v1.3 | Active |
| ECW160 | v1.1 | Active |
| ECW200 | — | Active |
| ECW201L-AC | — | Active |
| ECW201L-PoE | — | Active |
| ECW210L | — | Active |
| ECW212L | — | Active |
| ECW215 | v1.1 | Active |
| ECW220 | v1.1 | Active |
| ECW220S | — | Active |
| ECW230 | v1.2 | Active |
| ECW230S | — | Active |
| ECW260 | v1.1 | Active |
| ECW270 | v1.2 | Active |
| ECW336 | v1.1 | Active |
| ECW510 | v1.3 | Active |
| ECW515 | v1.2 | Active |
| ECW516L | — | Active |
| ECW520 | v1.1 | Active |
| ECW526 | v1.4 | Active |
| ECW536 | v1.3 | Active |
| ECW536S | — | Active |
| ECW560 | — | Active |

### Cloud Switch (21 models)
| 型號 | 版本 | 狀態 |
|------|------|------|
| ECS1008P | — | Active |
| ECS1112FP | v1.3 | Active |
| ECS1528 | — | Active |
| ECS1528FP | v1.3 | Active |
| ECS1528P | — | Active |
| ECS1528T | — | Active |
| ECS1552 | v1.3 | Active |
| ECS1552FP | v1.3 | Active |
| ECS1552P | — | Active |
| ECS205L | — | Active |
| ECS208L | — | Active |
| ECS2310FP | — | Active |
| ECS2510FP | v1.3 | Active |
| ECS2512 | v1.3 | Active |
| ECS2512FP | v1.3 | Active |
| ECS2528FP | v1.3 | Active |
| ECS2530FP | v1.0 | Active |
| ECS2552FP | v1.3 | Active |
| ECS5512 | v1.3 | Active |
| ECS5512F | — | Active |
| ECS5512FP | v1.5 | Active |

### Cloud Camera (7 models)
| 型號 | 版本 | 狀態 |
|------|------|------|
| ECC100 | v1.0 | Active |
| ECC100Z | — | Active |
| ECC120 | — | Active |
| ECC120Z | — | Active |
| ECC500 | v1.0 | Active |
| ECC500Z | v1.0 | Active |
| ECC600 | — | Active |

### Cloud NVS (3 models)
| 型號 | 版本 | 狀態 |
|------|------|------|
| EVS1002D | — | Active |
| EVS1004D | — | Active |
| EVS3004U | — | **Pending** |

### Cloud VPN Firewall (4 models)
| 型號 | 版本 | 狀態 |
|------|------|------|
| ESG320 | v1.1 | Active |
| ESG510 | v1.6 | Active |
| ESG610 | v1.6 | Active |
| ESG620 | v1.6 | Active |

### Extender (3 models)
| 型號 | 版本 | 狀態 |
|------|------|------|
| EXT1105P | — | Active |
| EXT1106 | v1.1 | Active |
| EXT1109P | — | **Pending** |

### Unmanaged Switch (3 models)
| 型號 | 版本 | 狀態 |
|------|------|------|
| ES105 | — | Active |
| ES108 | — | Active |
| ES110FP | — | Active |

> 版本顯示「—」表示 Google Drive DS 資料夾中尚未找到對應的 PDF 檔案。

---

## 7. 自動同步機制

### 同步排程
- **自動**: 每天 09:00 (台灣時間) 透過 Vercel Cron 觸發
- **手動**: Dashboard 右上角「Sync」按鈕

### 同步流程
1. 讀取 Google Sheet (Web Overview + Detail Specs) → 更新產品資料 + 規格
2. 掃描英文 `{ProductLine}/DS Images/` → 同步 product / hardware / radio pattern 圖到 Supabase Storage，更新 `products` 表
3. 對每個已啟用的語言，掃描 `{ProductLine}_{locale}/DS Images/` → 同步 hardware 圖，更新 `product_translations.hardware_image`
4. 掃描各語言的 DS 資料夾 → 偵測最新 Datasheet 版本號
5. 比對現有資料 → 偵測變更 → 記錄 Change Log
6. 有變更時 → 發送 Telegram 通知

### 變更通知
- 系統會自動偵測所有欄位的變更 (含 Status 變更)
- 通知發送到 Telegram 群組，按產品線分組顯示

---

## 8. 快速檢查清單

新增一個產品時，需要確認以下事項：

- [ ] Google Sheet Web Overview 填寫完整 (Model Name, Model Number, Status, Headline, Single Overview, Key Feature Lists)
- [ ] Google Sheet Detail Specs 填寫完整
- [ ] 英文產品線 `{ProductLine}/DS Images/` 放入 `{Model}_product.png`
- [ ] 英文產品線 `{ProductLine}/DS Images/` 放入 `{Model}_hardware.png`
- [ ] (AP only) `{ProductLine}/DS Images/` 放入 Radio Pattern 圖片
- [ ] (多語言) 對應語言產品線 `{ProductLine}_{locale}/DS Images/` 放入 `{Model}_hardware_{locale}.png`
- [ ] 確認 Status 欄位正確 (Active / Upcoming / Pending)
- [ ] 執行一次 Sync 確認資料正確匯入
