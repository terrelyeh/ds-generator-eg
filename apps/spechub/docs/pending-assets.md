# 待補素材 / 待 PM 處理

> 從 CLAUDE.md 搬出來（2026-08-12）。這是**庫存清單，不是寫程式的指引** —— 內容每
> 週都在變，而且讀了不會改變你怎麼寫程式碼。真正影響實作的規則留在 CLAUDE.md。
>
> 缺圖會讓該語系的 PDF 生不出來（gate 在 `canGenerate`），所以「某台產不出 PDF」
> 先查這裡再查程式。

1. **PM 待補圖** — **Cloud PDU 4 台全缺**（`_product` / `_hardware`;DS Images 空的）;
   **Station AP 3 台全缺**（`_product` / `_hardware` + antenna:**三台都是
   `_Port1/_Port2 × H/E-plane`**——Station 線不分頻段,ENS621EXT 雖是 dual-radio
   也一樣走 port）;
   **EOC 6 台全缺**（`_product` / `_hardware` ×2 / antenna ×4）;
   **AI Server S21 / S11 全缺**（SE110 / SE210 / S41 已完整）;
   **Orin Box 缺 7 張 `series_*`**。⚠️ 檔名**單底線**（S41 曾因 `S41__product.png`
   雙底線靜默同步不到,改名後才進來）。
2. **EOC 日文版待 PM 在翻譯頁 Confirm** — 6 台都已翻好但還是 Draft,Confirm 前
   生不出正式 PDF。內容/架構圖/字型都已就緒。
3. **EOC sheet 有筆錯誤待 PM 修** — EOC600/610/620 的第一條 feature 寫
   "supports up to 16 devices in PtMP",但規格表 Max Subscribers = **4**
   （那句是從 EOC655 複製的）。會印在 datasheet 第 2 頁。
4. **Cloud AP 素材缺口** — 27 台裡 21 台在 Drive 沒有 datasheet 用圖 → 英文版 PDF 生不出來
   （日/中文版不受影響,各語系有自己的 hardware image）。其他線各缺 1–3 台。
