# Ask 聊天互動規範 (Ask Chat UX Spec)

> 給 RD / PM 團隊參考。涵蓋 Ask SpecHub 與 EnGenie demo 兩個聊天介面的**動態效果、互動行為、回覆格式與樣式**。
> Last updated: 2026-06-09

本系統的「與 AI 對話」分成兩個介面,但**共用同一套互動引擎**。這份文件定義它們的共同規範,並標註兩者刻意保留的差異。新增任何聊天介面、或調整既有行為時,都應遵循此規範。

> **實機預覽**:HTML 版本(`public/docs/ask-chat-ux-spec.html`,部署後 `…/docs/ask-chat-ux-spec.html`)頂端內嵌了 `/demo/ask` 的實機畫面,可邊讀規範邊操作。Demo 線上位置:`https://ds-generator-eg.vercel.app/demo/ask`(需 demo 通行碼)。

---

## 1. 總覽與範圍

| 介面 | 路徑 | 對象 | 個性 |
|---|---|---|---|
| **Ask SpecHub**(桌機/網頁 panel) | Navbar「Ask」右側滑出 panel + `/ask` 全頁 | 內部團隊(需登入) | 工具感、藍色、inline 引用、對話歷史 |
| **EnGenie demo** | `/demo/ask`(passcode + iOS PWA) | 對外展示 / 非帳號使用者 | 溫暖紙感、serif 標題、隱藏 inline 引用 |

**核心原則:互動引擎共用,外觀個性分流。**
串流、停止、重新生成、捲動、輸入這些**行為**由共用程式碼決定,兩版必然一致;字級、配色、引用呈現這些**外觀**留在各自元件,維持品牌差異。

---

## 2. 架構

### 2.1 共用檔案(改這裡,兩版同時生效)

| 檔案 | 職責 |
|---|---|
| `src/hooks/use-chat-stream.ts` | **聊天核心引擎**:訊息列、loading/status 狀態、SSE 串流、rAF 批次、停止(abort)、重新生成、最終解析。匯出 `ChatMessage` / `ChatSource` 型別。 |
| `src/hooks/use-stick-to-bottom.ts` | **智慧自動捲動**:只有使用者貼在底部時才跟著捲;否則放手並透過 `isAtBottom` 顯示「回到底部」鈕。 |
| `src/components/chat/code-block.tsx` | **程式碼區塊**:語言標籤 + 一鍵複製 + 深色底 + 語法高亮。作為 react-markdown 的 `pre` override。 |

### 2.2 各介面元件(只放外觀 / 該介面特有功能)

| 檔案 | 內容 |
|---|---|
| `src/components/ask/ask-chat.tsx` | 桌機版 panel:`.ask-markdown` 樣式、inline 引用 tooltip、對話歷史 sidebar、Persona / Profile / Model 選擇器。 |
| `src/components/demo/engenie-chat.tsx` | demo 版:`prose` 樣式、EngenieMark 頭像、隱藏 inline 引用(改用來源 chips)、serif 歡迎標題。 |

### 2.3 後端

`POST /api/ask`(SSE streaming)。事件型別:

| event | 內容 | 用途 |
|---|---|---|
| `status` | `"searching"` / `"generating"` | 驅動即時狀態文字 |
| `chunk` | `content` 片段 | 串流文字 |
| `sources` | 來源文件陣列 | 引用 / 來源清單 |
| `metadata` | `follow_ups`、`image_map`、`provider` | 後續問題、圖片、實際使用的模型 |
| `[DONE]` | — | 串流結束 |

---

## 3. 互動行為規範

### 3.1 串流 (Streaming)
- 文字以 **rAF 批次**更新:chunk 累積在 ref,**每一幀(frame)只 flush 一次** state。禁止「每個 token 就 setState」——會逐字重渲染整列、造成閃爍與掉幀。
- 訊息列**memoize**:只有正在串流的那一則會重渲染,已完成的訊息不動。
- 串流中顯示**游標**(見 §4)。

### 3.2 即時狀態 (Live status)
送出後立即顯示狀態,並隨後端 `status` 事件切換:

| 階段 | 文案 |
|---|---|
| `searching`(送出當下 + 檢索中) | 搜尋相關資料中… |
| `generating`(開始生成) | 整理回覆中… |

狀態與「思考中」動畫(跳動圓點 / spinner)一起出現在尚無內容的助理訊息列。

### 3.3 停止生成 (Stop)
- 生成中,送出鈕變成 **■ Stop**。
- 按下 → `AbortController.abort()` 中止串流。
- **已經吐出來的內容必須保留**,標記結尾:桌機 `_(stopped)_`、demo `_(已停止)_`。不可整段丟棄、不可顯示成 Error。

### 3.4 重新生成 (Regenerate)
- 最後一則助理回覆下方提供「Retry / ↻」。
- 行為:找到**最後一則使用者訊息**,用同一個問題重跑(沿用先前對話 history),覆蓋舊回答。
- 生成中不顯示此鈕。

### 3.5 智慧自動捲動 (Smart auto-scroll)
- 使用者**貼在底部(距底 < 80px)**時:新內容自動跟著捲到底(串流時用即時捲動,不用 smooth,避免跟動畫打架)。
- 使用者**往上捲讀歷史**時:放手,不強制拉回。
- 不在底部且有訊息時:右下角出現「↓ 回到最新」浮動鈕,點了平滑捲到底。

### 3.6 輸入框 (Input)
- <kbd>Enter</kbd> 送出;<kbd>Shift</kbd>+<kbd>Enter</kbd> 換行。
- **自動長高**(autosize)至上限後內部捲動:桌機 panel 120 / 全頁 160px;demo 140px。
- 送出後清空並重置高度。

### 3.7 後續問題 (Follow-ups)
- 後端在回答後以 `---` 分隔,接 **3 個**建議問題。
- 解析後渲染成可點的 chips(只在最後一則回覆顯示),點擊即送出該問題。

### 3.8 複製 / 來源 / 引用
| | 桌機 Ask panel | demo |
|---|---|---|
| inline 引用 | 顯示 `[n]`,hover 出 tooltip(標題、來源類型、相似度 %、參考圖)。外部連結 / wifi-regulation 可點 | **隱藏 `[n]`**(`stripCitations`),保持乾淨 |
| 來源清單 | 「📎 N sources referenced」可折疊清單 | ActionBar「N references」展開成來源 chips |
| 動作列 | Copy · Regenerate · `via {provider}` | Copy · Retry · references |

### 3.9 對話歷史 (Sessions) — 僅桌機版
- 每輪結束後**自動存檔**(debounce 1s)。
- 左側 sidebar:載入舊對話、刪除、多選批次刪除、相對時間(Just now / 5m ago…)。
- demo **無**歷史(刻意:對外、無帳號)。

---

## 4. 動態效果規範 (Animation)

| 效果 | 介面 | 規格 |
|---|---|---|
| 訊息淡入 | 兩版 | `animate-in fade-in duration-300`;使用者訊息加 `slide-in-from-bottom-1` |
| 思考中圓點 | demo | 3 顆點,`engenieDot` 1.2s、依序 stagger 0.2s,上下浮動 + 透明度 |
| 思考中 spinner | 桌機 | 環狀 spinner + 狀態文字 |
| 串流游標 | 兩版 | 結尾脈動 caret;桌機 = 行內 3px 直條,demo = 最後段落 `::after` |
| 頭像脈動(思考時)| demo | `engenieThink` 1.6s,scale 0.9↔1.06 + 透明度 |
| 歡迎圖示呼吸 | 桌機 | `breathe` 3s,scale 1↔1.08 |
| 回到底部 FAB | 兩版 | `animate-in fade-in zoom-in` 200ms |
| 複製回饋 | 兩版 | 勾勾 icon + 「Copied」維持 1.6s |

**原則**:動畫一律短(200–300ms 進場,脈動 1.2–3s),只用來「指示狀態」,不喧賓奪主。

---

## 5. 格式與樣式規範 (Format & Styling)

### 5.1 文字排版 (Typography)
ChatGPT/Claude 的舒適感來自**大行距 + 足夠間距 + 限制行寬**。兩版基準如下:

| | 桌機 `.ask-markdown` | demo `prose` |
|---|---|---|
| 內文字級 | 15px | 16.5px |
| 行距 | 1.75 | 1.85 |
| 段落間距 | 14px | 24px(`my-6`)|
| 標題 | h1 19 / h2 17 / h3 15.5 | h1 23 / h2 20 / h3 17.5 |
| 清單 | `padding-left: 24px`、項目間距 6px | `pl-5`、`my-2.5` |
| 表格 | 14px,斑馬紋 | 14px,可橫向捲動 |
| 閱讀寬度上限 | `max-w-[46rem]` | 容器 `max-w-[720px]` |

> **桌機版的 markdown 樣式集中在 `globals.css` 的 `.ask-markdown`**;demo 用 Tailwind `prose`(需 `@tailwindcss/typography` plugin)。兩者數值刻意對齊,讀起來一致。

### 5.2 Markdown 渲染
- 透過 `react-markdown` + `remark-gfm`(表格、刪除線等 GFM)。
- 表格、清單(含巢狀)、引用區塊、水平線、連結、圖片皆有樣式。
- 引用區塊左側用 **engenius-blue** 色條。

### 5.3 程式碼區塊 (CodeBlock)
- 共用元件,兩版外觀一致。
- 頂部 header bar(深色 `#0d1117`):左=語言標籤(大寫、等寬、slate-400)、右=一鍵 **Copy**。
- 內文深色底 + **語法高亮**(`rehype-highlight` + highlight.js `github-dark` token 配色)。
- `rehype-highlight` 選項:`{ detect: true, ignoreMissing: true }`。
- inline code 與 block code 樣式分離(`.ask-markdown :not(pre) > code` 才套 inline 樣式)。

### 5.4 色彩 (Brand tokens)
| 用途 | 值 |
|---|---|
| 主藍 | `#03a9f4`(`engenius-blue`)|
| 深藍 | `#0288d1` |
| 深色文字 | `#231f20`(`engenius-dark`)|
| 灰色文字 | `#6f6f6f`(`engenius-gray`)|
| 程式碼底 | `#0d1117` |

> **禁止純黑 `#000000`** — 一律用 `#231f20` 或 `#2C3345`。

---

## 6. 回答內容契約 (Answer Content Contract)

樣式再好也救不了一坨純文字 —— 回答**本身的結構**由 `/api/ask` 的 system prompt 強制。規則(節錄,以程式碼為準):

1. **語言對齊**:用使用者最後一則訊息的語言回答(英文進→英文出,中文進→中文出,日文進→日文出)。
2. **開門見山**:開頭 1–2 句直接回答,不要「根據文件…」開場白。
3. **Markdown 結構**(寫得像 ChatGPT/Claude,可掃讀):
   - 多段落用 `##` / `###` 分節。
   - 並列重點用 `-`;步驟 / 順序用 `1.`。
   - **比較 2 個以上產品 / 型號 / 方案時用表格**(一列一項)。
   - **粗體**標出關鍵字、型號、規格值(如 **ECW536**、**WiFi 7**、**2.5 GbE**)。
   - 段落短(2–4 句),段間留空行。
   - code fence 只給真正的指令 / 設定,不要包一般文字。
4. **引用**:`[n]` 放在段落或關鍵主張**結尾**,每段最多 2 個,不可疊放(`[1,3,4]`)。
5. **後續問題**:答完後一行 `---`,接**正好 3 個**後續問題。

---

## 7. RD:如何用共用引擎做新的聊天介面

新增任何聊天 surface,**不要再複製串流邏輯**,直接用共用 hook:

```tsx
import { useChatStream } from "@/hooks/use-chat-stream";
import { useStickToBottom } from "@/hooks/use-stick-to-bottom";
import { CodeBlock } from "@/components/chat/code-block";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

function MyChat() {
  const { messages, loading, loadingStatus, submit, stop, regenerate } = useChatStream({
    getParams: () => ({ provider, persona, profile }), // 每次請求帶的參數
    onComplete: (msgs) => save(msgs),                  // 可選:存檔
    stoppedLabel: "_(stopped)_",                       // 可選:停止標記
  });
  const { ref, isAtBottom, scrollToBottom } = useStickToBottom([messages, loading]);

  // 渲染 messages;markdown 用 CodeBlock 當 pre override:
  // <ReactMarkdown remarkPlugins={[remarkGfm]}
  //   rehypePlugins={[[rehypeHighlight, { ignoreMissing: true, detect: true }]]}
  //   components={{ pre: ({ children }) => <CodeBlock>{children}</CodeBlock> }} />
}
```

- `submit` / `stop` / `regenerate` 是**referentially stable**,可直接傳給 memoized 訊息元件而不會每幀重渲染。
- 自訂外觀(字級、配色、引用呈現)留在你的元件;**行為別自己重寫**。

---

## 8. Do / Don't 檢查清單

**Do**
- 串流用 rAF 批次 + memoize 訊息。
- 自動捲動只在「貼底時」跟;否則給「回到底部」鈕。
- 停止時保留已生成內容。
- 表格 / 粗體 / 分節讓回答可掃讀。
- 動畫短而克制(進場 200–300ms)。
- 新介面複用 `useChatStream` / `useStickToBottom` / `CodeBlock`。

**Don't**
- ❌ 每個 token 就 setState(會閃爍掉幀)。
- ❌ 每次訊息變動就硬捲到底(讀歷史會被拉走)。
- ❌ 停止 / 出錯就把已生成內容丟掉。
- ❌ 把串流邏輯複製成第三份。
- ❌ 用純黑 `#000000`;數字請用 `tabular-nums`。
- ❌ 在元件裡硬寫 hex 色值(用 token / `globals.css`)。

---

## 附錄:相關檔案速查

```
src/hooks/use-chat-stream.ts        # 串流引擎(共用)
src/hooks/use-stick-to-bottom.ts    # 智慧捲動(共用)
src/components/chat/code-block.tsx  # 程式碼區塊(共用)
src/components/ask/ask-chat.tsx     # 桌機 Ask panel
src/components/demo/engenie-chat.tsx# EnGenie demo
src/app/api/ask/route.ts            # SSE 後端 + 回答內容契約
src/app/globals.css                 # .ask-markdown 樣式 + hljs 主題
```
