# EnGenie Ask — Chrome Side Panel（內部測試）

在任何網頁按工具列圖示或快捷鍵，右側打開 EnGenie Ask。

這個 extension 本身幾乎沒有邏輯：Side Panel 裡是一個 iframe，載入 EnGenie 現有的
`/embed/<slug>` 頁面——跟 SpecHub 側邊那顆 widget 是同一個聊天介面。認證、知識範圍、
模型、配額全部由 workspace 決定，不在 extension 裡。

## 安裝（載入未封裝）

1. Chrome 打開 `chrome://extensions`
2. 右上角開啟「開發人員模式」
3. 「載入未封裝項目」→ 選這個資料夾（`extensions/engenie-sidepanel`）
4. 確認 ID 是 `dakefbpojccpgknegbfbfeicfadbeamk`

## 使用

- 點工具列的 EnGenie 圖示，或按 **Alt+Shift+E**（Mac：**⌘⇧E**）
- 第一次會要求輸入 workspace 的 passcode，之後 7 天有效
- 快捷鍵可以在 `chrome://extensions/shortcuts` 改

## 它連到哪裡

設定在 `config.js`：

| | |
|---|---|
| EnGenie | `https://engenie-eg.vercel.app` |
| workspace | `ext` |

`ext` workspace 看得到**目前所有知識**（不限產品範圍、所有來源類型、6 個知識領域全勾）。
以後新開的知識領域**不會自動加進來**，要到 Settings → Ask Workspaces 編輯 `ext` 勾選。

## 為什麼 ID 是固定的

`manifest.json` 的 `key` 是一把公鑰，Chrome 用它算出 extension ID。沒有它的話，
「載入未封裝」的 ID 會跟著資料夾的絕對路徑變——換電腦或搬資料夾就變成另一個 ID，
而 workspace 的「允許嵌入的網域」只認得原本那個，panel 會一片空白。

對應的私鑰**不需要**，也沒有放進 repo：載入未封裝用不到它，上架 Chrome Web Store
時商店會給新的 ID（到時把新 ID 加進 `ext` 的允許清單即可）。

## 安全

- passcode 等於「讀取所有內部知識」的鑰匙（包括 Support Knowledge 和 RD 內部文件）。
  不要貼在群組裡。
- 要讓所有已發出的 token 失效：在 workspace 設定裡撤銷 token（會 bump `token_version`），
  並換一組 passcode。
- extension 不讀取你正在看的網頁內容。之後如果要做「問這一頁」，只會帶你**選取**的文字。

## 疑難排解

**Panel 一片空白 / 顯示拒絕連線**：workspace 的允許清單裡沒有這個 extension 的 ID。
到 Settings → Ask Workspaces → `ext` →「允許嵌入的網域」確認有這一行：
`chrome-extension://dakefbpojccpgknegbfbfeicfadbeamk`
