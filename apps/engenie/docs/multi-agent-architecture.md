# EnGenie 多 Agent 架構（Multi-Agent）

> **姊妹篇**：[單一 Agent 架構（從純 RAG 到工具導向 Agent）](agent-architecture.md)。那份講「一個 agent ＋ 一堆工具」怎麼設計（**先讀那份**）；這份只講多 agent。
>
> 撰寫 2026-06-15 · 狀態：進階設計參考（尚未實作）· 讀者：PM／RD／決策者。

這份專講「**當單一 agent 撐不住、要拆成多個 agent**」時怎麼設計：何時拆、有哪幾種結構、會踩到哪些難題、套到 EnGenie 怎麼走。

---

## 0. 一句話總結

單一 agent（一個 agent ＋ 一堆工具）能走的路**比你想的遠** —— 先把那條做扎實。**Multi-agent**（多個各有專長的 agent 協作）不是「更聰明」的免費升級，而是**用「成本 × 延遲 × 失敗面 × 除錯難度」換「專業化 ＋ 隔離」**。只有撞到具體痛點（工具太多選錯、人設互相打架、子任務要分模型、要平行、**安全隔離**）才值得拆。真要拆，最省的入口是**「子 agent 當工具」**（沿用單一 agent 已有的工具抽象）；EnGenie 的第一刀建議**按安全邊界切**（知識 Agent vs 即時網路 Agent）。

---

# Part A — 觀念

## A.1 什麼是「多 agent」（以及什麼不是）

**多 agent** ＝ 不只一個「會自己跑 agent loop 的決策體」，每個各自帶**自己的 system prompt ＋ 自己的工具子集 ＋（可選）自己的模型**，彼此協作完成一個任務。

最常見的混淆，先講清楚**什麼不是多 agent**：

> **「一個 agent 用很多工具」不是多 agent。** 那叫單一 agent（見姊妹篇）。判準很簡單：數數看「**會自己呼叫 LLM 做決定的決策體**」有幾個 —— 一個就是單一 agent，多個才是 multi-agent。「工具」即使內部會打 API、查 DB，只要它不是「自己再跑一輪 agent loop」，就只是工具、不是 agent。

```
單一 agent（不是多 agent）           多 agent
   ┌─ Agent ─┐                       ┌─ Supervisor ─┐
   │  決策   │ ──► 工具 工具 工具      │    決策    │ ──► 子 Agent ──► 工具 工具
   └─────────┘                       └────────────┘ ──► 子 Agent ──► 工具
   1 個決策體                              2＋ 個決策體（各自會做決定）
```

## A.2 什麼時候才真的需要多 agent？

預設答案是「**還不需要**」。只有**實際撞到**下面的痛點之一，拆成多 agent 才划算：

| 觸發訊號 | 單一 agent 為什麼會痛 | 拆成多 agent 怎麼解 |
|---|---|---|
| **工具太多、選錯率上升** | 一個 agent 掛 15–20 個工具，system prompt 爆長、模型常選錯工具 | 按領域拆，每個 agent 只看自己 3–5 個工具，選得更準 |
| **人設／指令互相打架** | 「謹慎的內網維運」和「親切的產品問答」需要完全不同的 prompt 與安全姿態，塞一份兩邊都變差 | 各自一個 agent、各自一份 system prompt |
| **子任務該用不同模型** | 檢索用便宜模型就好，但對設備數據推理要強模型 —— 單一 agent 全程同一個 | 每個 agent 綁自己的模型，做成本／品質分級 |
| **子任務可平行** | 「比較三台規格 ＋ 同時查三台即時狀態」單一 agent 只能一步步排隊 | 主管把工作 fan-out 給多個 worker 同時跑 |
| **安全隔離** | 能打內網即時 API 的能力，跟對外公開問答塞在同一個 agent，風險面變大 | 把「碰得到內網」的 agent 獨立、收緊權限，跟公開 agent 隔開 |

> **反向訊號**：如果想做多 agent 只是因為「聽起來比較進階」，**別做**。每多一個 agent ＝ 多一輪（或多輪）LLM 呼叫，成本、延遲、失敗面全部往上疊。把這五個訊號當**檢核表**：一個都沒中，就繼續用單一 agent。

## A.3 跟單一 agent 的關係：是「疊上去」，不是「換掉」

多 agent **不是另一套架構**，而是把單一 agent 當積木疊起來。姊妹篇裡的每一塊都還是地基：

- **Agent Loop**（思考→行動→看結果）—— 每個子 agent 內部還是一個 agent loop。
- **Tool 抽象**（姊妹篇 §3.2）—— 子 agent 之間的接法，直接**重用**這個介面（見 B.2）。
- **Provider 抽象** —— 不同子 agent 可綁不同模型，靠的就是這層。
- **per-workspace scope**（姊妹篇 §3.5）—— 「哪個 workspace 能用哪個子 agent」就是 scope 再上一層。

> **結論**：先有扎實的單一 agent，多 agent 才有地基。如果單一 agent 的 Tool／Provider／scope 抽象沒做好，硬上多 agent 只會更亂。**順序不能顛倒。**

---

# Part B — 四種結構（topology）

多 agent「怎麼接」主流就這四種骨架。前兩種最常用，後兩種知道即可。

## B.1 主管–工人（Supervisor / Orchestrator-Worker）

一個「主管 agent」收下需求，**自己不做領域工作**，而是判斷該交給哪個（哪幾個）專長子 agent、派工、收回結果、綜合成最終答案。子 agent 之間互不知道彼此，只對主管負責。

```
                 ┌──────────── Supervisor（主管 agent）────────────┐
   使用者問題 ──▶ │  看懂需求 → 決定派給誰 → 收齊結果 → 綜合成答案    │
                 └──────┬──────────────┬──────────────┬──────────┘
                        ▼              ▼              ▼
                  知識 Agent      即時網路 Agent    （其他專長）
                  └ search_kb     └ device_status …   └ …
                     ↑ 各自有自己的 prompt、工具子集、甚至模型；可平行派工
```

- **適合**：專長多（3＋）、需要**動態**決定找誰、或要**平行** fan-out。
- **優點**：最有彈性；新增專長＝多掛一個子 agent。
- **缺點**：要多寫一層 supervisor ＋ 派工協定；主管本身也會選錯人。

## B.2 子 agent 當工具（Agent-as-Tool）— 最省的入口

這是**從單一 agent 設計最自然的長法**：回頭看姊妹篇 §3.2 的 `Tool` 介面，那張表已經列了一種工具叫「**LLM 型工具 / 子 agent**」。一個子 agent 其實就是一個 `run()` 內部跑著自己 agent loop 的工具 —— 上層 agent 像呼叫任何工具一樣呼叫它，**完全沿用既有抽象**。

```ts
// 把一個「即時網路專長 agent」包成上層 agent 的一個工具
const networkSpecialistTool: Tool<{ task: string }> = {
  name: "ask_network_specialist",
  description: "把『設備即時狀態 / 事件 / 授權』類的子任務，交給內網即時網路專長 agent 處理並回報。",
  inputSchema: { type: "object", properties: { task: { type: "string" } }, required: ["task"] },
  requiresPermission: "agent.network",
  async run({ task }, ctx) {
    // ↓ run() 裡面是「另一個 agent loop」，帶自己的 prompt 與自己的工具子集
    const answer = await runAgent({
      ctx,
      systemPrompt: NETWORK_AGENT_PROMPT,          // 自己的人設＋安全指示
      tools: [getDeviceStatus, queryEventLogs, getOrgLicenses],  // 只給網路工具
      model: "claude-strong",                      // 高風險，綁強模型
      messages: [{ role: "user", content: task }],
    });
    return { ok: true, content: answer.text, display: answer.display };
  },
};
```

> **關鍵**：(B) 不是新架構，是 §3.2 Tool 抽象的一個 case。把單一 agent 的 Tool 介面做好，未來要多 agent 就是「**把某個專長包成一個 `run()` 是 agent loop 的工具**」—— **不用重寫**。上層 agent 連「它是不是 agent」都不用知道，照選工具邏輯叫即可。

- **適合**：只想隔出 1–2 個專長子 agent（**EnGenie 的起點**）。
- **優點**：幾乎零新概念、零新基礎建設；漸進、好回退。
- **缺點**：子 agent 是「被呼叫」而非「被協調」，不適合需要多個 agent 來回協商的場景。

## B.3 流水線（Sequential Pipeline）

固定順序、把產出一棒接一棒往下傳：`planner → executor → reviewer`。每一棒是一個專長 agent，**順序寫死**、不動態決定。

```
需求 ──▶ Planner ──(計畫)──▶ Executor ──(初稿)──▶ Reviewer ──▶ 成品
         拆解任務            實際執行              審查/校正
```

- **適合**：階段固定的工作（先規劃再執行再覆核），例如「先擬答 → 再事實查核 → 再潤稿」。
- **優點**：最好控、最好除錯（流程是死的）、行為可預期。
- **缺點**：不靈活；不適合「事先不知道要做幾步、找誰」的任務。

## B.4 對等交接（Handoff / Swarm）

沒有主管；agent 之間**把控制權「轉接」**給彼此 ——「這題不歸我，轉給 X」。常見於客服路由（前線 → 帳務 → 技術）。

```
使用者 ──▶ 分流 Agent ──「這是帳務問題」──▶ 帳務 Agent ──「需要技術」──▶ 技術 Agent
            （誰拿到球，誰就負責，或再轉手）
```

- **適合**：意圖明確、可一棒交給某個專責 agent 全權處理的場景。
- **優點**：每個 agent 上下文乾淨（只看自己這段）。
- **缺點**：難「合併多領域」（球一次只在一個人手上）；交接點容易掉資訊。EnGenie 用不太到。

## B.5 怎麼選？

| 結構 | 誰決定流程 | 能平行? | 改動量 | 適合 |
|---|---|---|---|---|
| **子 agent 當工具**（起點） | 上層 agent（當工具叫） | 可（並行呼叫） | **最小**（沿用 Tool 介面） | 隔出 1–2 個專長 |
| **主管–工人** | 主管 agent 動態派工 | 可（fan-out） | 中（多一層 supervisor） | 3＋ 專長、動態組合 |
| **流水線** | 寫死的順序 | 否（一棒接一棒） | 小–中 | 階段固定的工作 |
| **對等交接** | 各 agent 自行轉接 | 否（球在一人手上） | 中 | 單領域路由 |

> **建議路徑**：`子 agent 當工具`（先隔 1–2 個）→ 撐不住再升級 `主管–工人`。流水線／對等交接 EnGenie 多半用不到。

---

# Part C — 核心難題（拆下去才會遇到）

## C.1 上下文怎麼傳（最難的一題）

子 agent 預設**看不到**完整對話。主管要決定「往下傳什麼、子 agent 往上回什麼」。這是多 agent 最大的工程成本，主要三種做法：

| 做法 | 怎麼傳 | 代價 |
|---|---|---|
| **整包傳** | 把完整對話歷史往下倒給子 agent | token 爆炸、子 agent 被無關內容干擾 |
| **摘要傳** | 主管先摘要再往下傳 | 省 token，但摘要會**掉資訊**、且多一次 LLM 呼叫 |
| **結構化交接**（建議） | 只傳一個「**明確的子任務規格**」（typed task），子 agent 回一個「**結構化結果**」 | 要事先設計好任務／結果的 schema，但最省、最好除錯 |

> **原則**：把子 agent 當「**純函式**」設計 —— 給定清楚的輸入（task spec）、回固定形狀的輸出（result），**不依賴**外部對話脈絡。這也正好對上 B.2 的 `Tool` 介面（`inputSchema` ＋ `ToolResult`）。

## C.2 成本與延遲會「相乘」

每個子 agent 各跑一輪自己的 loop（多次 LLM 呼叫）。一棵兩層的 agent 樹，很容易變成單一 agent 的**數倍** token 與時間。緩解：

- **保持淺**：1 個主管 ＋ 一排平行專長（深度 ≤ 2），不要 agent 叫 agent 叫 agent。
- **worker 用便宜模型**：只有需要強推理的子 agent 才綁強模型。
- **回報前先摘要**：子 agent 把大量原始資料整理成精簡結論再回主管，別整包往上倒。
- **能不拆就不拆**：簡單問題讓主管自己一步收掉，別硬派工。

## C.3 錯誤會累積、答案誰負責

- **錯誤累積** —— 主管派錯 ＋ 子 agent 讀錯，誤差一層層疊上去，也更難定位是哪一層出包。
- **矛盾要調和** —— 兩個子 agent 給出衝突資訊時，**主管要負責調和並對最終答案負責**，不能把兩段矛盾直接貼給使用者。
- **跨 agent 引用** —— 來源標註（知識庫引用、即時數據查詢時間）要能**從子 agent 一路帶回**主管的最終答案，否則使用者看不到憑據。

## C.4 可觀測性與護欄

- **trace 變成樹** —— 原本一條線性紀錄，現在要記「哪個 agent 叫了哪個、帶什麼 task、回什麼 result」**整棵樹**，否則出事查不到。
- **兩道上限** —— 除了單一 agent 已有的「步數上限」，多 agent 要再加「**agent 深度上限**」，避免遞迴失控。
- **每個子 agent 沿用安全模型** —— 子 agent 的工具一樣受 allow-list ＋ scope ＋ 稽核 log 管（見姊妹篇 §3.6），**不因為被包成工具就鬆綁**。

> 一句話：**多 agent ＝ 用「成本 × 延遲 × 失敗面 × 除錯難度」換「專業化 ＋ 隔離」。** 沒撞到 A.2 的痛點前，這筆交易划不來。

---

# Part D — 套到 EnGenie

## D.1 第一刀：按「安全邊界」拆，不是按「聰明」拆

如果哪天 EnGenie 的單一 agent 真的撐不住要拆，最有價值的第一刀是**沿著安全邊界**切 —— 把「碰得到內網」和「對外公開」分開：

| 專長 agent | 工具子集 | 模型 / 風險 | 誰能用（沿用 §3.5 scope） |
|---|---|---|---|
| **知識 Agent** | `search_knowledge_base`（＝現在的 RAG） | 便宜模型可、唯讀、低風險 | 所有 workspace（含對外公開 widget） |
| **即時網路 Agent** | `get_device_status` / `query_event_logs` / `get_org_licenses` … | 強模型、碰內網、**高風險** | 僅內部 IT／FAE workspace，且限定 org |

> **為什麼先切這刀**：就算還不缺「更聰明」，光是**把高風險的內網能力獨立成一個收緊權限、可獨立稽核的 agent**，隔離價值就回本了。安全優先，聰明其次。

## D.2 用「子 agent 當工具」落地

不要一上來就蓋動態 supervisor。用 B.2 的做法：主管 agent 的工具清單裡，多一個 `ask_network_specialist`（內部就是即時網路 Agent 的 loop）。誰能用，繼續用 `ask_workspaces.scope` 管：

```jsonc
// ask_workspaces.scope —— 沿用姊妹篇 §3.5，只是把「能用的子 agent」也納入
{
  "knowledge_areas": ["marketing"],
  "tools": ["search_knowledge_base"],
  "agents": []                          // 公開 widget：只有知識，碰不到即時網路 agent
}
{
  "tools": ["search_knowledge_base"],
  "agents": ["network_specialist"],     // 內部 IT workspace：才開即時網路 agent
  "agent_orgs": ["org_abc"]             // 且限定可查的 org
}
```

> **＝同一個權限模型再上一層**：多 agent **不需要**另一套權限系統。「哪個 workspace 能叫哪個子 agent」就是 [§3.5](agent-architecture.md) per-workspace scope 的延伸。

## D.3 漸進路線（別一步到位）

| 階段 | 做什麼 | 結構 |
|---|---|---|
| **現在** | 把單一 agent 做扎實（姊妹篇 Part 3–5：Tool／Provider 抽象、scope、安全） | 單一 agent |
| **第一刀** | 把「即時網路」獨立成**一個**子 agent，用 agent-as-tool 掛上去；scope 加 `agents` 欄位 | 1 主 ＋ 1 專長（當工具） |
| **長出來再說** | 專長到 3＋（再加 FAE 診斷、報表…）、需要動態組合與平行，才把「當工具」升級成真正的 **supervisor** | 主管–工人 |

> **前提**：這條線排在姊妹篇 §5 的 Stage 4 之後 —— 單一 agent 穩了、且實際感受到 A.2 的某個痛點，再啟動。
>
> **好消息**：因為單一 agent 設計已經用了乾淨的 **Tool 抽象** ＋ **per-workspace scope**，未來要走多 agent，是「**把一個專長包成工具**」，不是打掉重練 —— 這套架構**天生就是 multi-agent-ready**。

---

# 附錄：延伸閱讀的觀念關鍵字

- **Orchestrator-Worker / Supervisor**：主管派工給專長 worker 的主流多 agent 結構（B.1）。
- **Agent-as-Tool**：把子 agent 包成工具的做法 —— 多 agent 最省的入口（B.2）。
- **Handoff / Swarm**：agent 之間轉接控制權的對等模式（B.4）。
- **Context Engineering for sub-agents**：怎麼設計「往下傳的子任務」與「往上回的結果」—— 多 agent 的核心工夫（C.1）。
- **框架地景**：市面上有 LangGraph、CrewAI、AutoGen 等多 agent 框架；但 EnGenie **現有的 Tool / Provider 抽象先夠用**，不急著綁框架 —— 需要時再評估，重點是觀念而非工具。
- **姊妹篇**：[單一 Agent 架構（從純 RAG 到工具導向 Agent）](agent-architecture.md) —— 一切的地基。
