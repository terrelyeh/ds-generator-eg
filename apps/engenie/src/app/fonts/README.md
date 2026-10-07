# Fonts（自帶，不在建置時抓）

這幾個字型以前用 `next/font/google`，每次 `next build` 都要去 Google Fonts 下載。
對方慢一下整個建置就掛（`Can't resolve '@vercel/turbopack-next/internal/font/google/font'`，
2026-10-01 與 10-07 各一次，都是 Plus Jakarta Sans）。現在檔案放在這裡，用 `next/font/local` 載入，
建置不再需要連外。

| 檔案 | 字型 | 軸 | 來源 |
|---|---|---|---|
| `geist.woff2` | Geist | wght 100–900 | fonts.gstatic.com/s/geist/v5 |
| `geist-mono.woff2` | Geist Mono | wght 100–900 | fonts.gstatic.com/s/geistmono/v6 |
| `plus-jakarta-sans.woff2` | Plus Jakarta Sans | wght 200–800 | fonts.gstatic.com/s/plusjakartasans/v12 |
| `inter.woff2` | Inter | wght 100–900 | fonts.gstatic.com/s/inter/v20 |
| `source-serif-4.woff2` | Source Serif 4 | wght 200–900 | fonts.gstatic.com/s/sourceserif4/v15 |

- 全部是 **latin 子集的可變字型**，跟原本 `subsets: ["latin"]` 一樣；中文照舊走系統字型的 fallback
- 授權：全部是 **SIL Open Font License 1.1**，可以隨專案散布
- 要更新：用 Google Fonts CSS2 API（`https://fonts.googleapis.com/css2?family=<名字>:wght@<範圍>`，
  帶一般瀏覽器的 User-Agent）取 `/* latin */` 那一段的 woff2 網址，下載後覆蓋
- `apps/spechub` 和 `apps/engenie` 各有一份，兩邊要一起換
