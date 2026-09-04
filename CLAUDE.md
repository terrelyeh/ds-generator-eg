# CLAUDE.md — Monorepo Root

> Monorepo 拆分**全部完成（Phase 1–5）**，藍圖見
> [apps/spechub/docs/monorepo-split-plan.md](apps/spechub/docs/monorepo-split-plan.md)。
> app 搬入 `apps/spechub`、`@eg/db`+`@eg/auth` 抽出、`apps/engenie` 析出
> （Vercel 專案 `engenie-eg`）、CLAUDE.md 分家；**Phase 5 cutover 已 merge 進 `main`
> （2026-06-13），兩個 prod 都在拆分後架構**。剩手動收尾：藍圖 §6 登入驗收、repo rename。

## 結構

```
├── apps/
│   ├── spechub/        # Product SpecHub — datasheet/文件生成（Vercel: ds-generator-eg, port 3000）
│   └── engenie/        # EnGenie — Knowledge RAG + Ask（Vercel: engenie-eg, port 3100）
├── packages/
│   ├── db/             # @eg/db — supabase server/client/admin + settings accessor + **errors（throwIfDbError/logIfDbError）** + DB types + supabase/migrations（唯一來源）
│   ├── auth/           # @eg/auth — session.ts(gate/RBAC/requireCron) + permissions.ts + page-guards.ts + **safe-next.ts（登入後導向驗證）**
│   └── llm/            # @eg/llm — OpenRouter chat client（chat completions 統一入口；**embedding 不走這裡**）
│                       #   + features.ts = 花費歸戶的功能標籤對照表（OpenRouter `user` 欄位）
└── package.json        # npm workspaces：apps/*, packages/*
```

跨 app 接點（sync→reindex 觸發、spechub widget、LLM keys 歸 engenie、
產品表唯讀約定）詳見兩個 app 的 CLAUDE.md「Monorepo 接點 / 跨 app 接點」章節。

- packages 直接輸出 `.ts`（package.json `exports` map），app 端用 `transpilePackages` 編譯；import 形式：`@eg/db/server|client|admin|settings|errors|types`、`@eg/auth/session|permissions|page-guards|safe-next`
- **新增任何 OpenRouter 呼叫點時必須帶 `feature`**（`chatComplete`/`streamComplete` 的必填選項，
  查 `packages/llm/src/features.ts` 的對照表 → 送進 OpenRouter 的 `user` 欄位做花費歸戶）。
  漏標不會有任何症狀——畫面正常、測試全過，花費只是靜靜落進 `unmapped`。
  所以有一支雙向檢查：`npm run check:feature-tags`（每個呼叫點都有標、每個標籤都有人用、
  **串流那支也送 `user`**、沒有人繞過共用函式自己打 endpoint）。標籤字串是對外契約，
  **改名不會改到舊資料**，儀表板上會裂成兩列。
- **所有護欄都在 CI 上跑**（`.github/workflows/guards.yml`,PR 和 push main 都會跑）。
  在那之前它們只是「記得跑才會叫」——**需要有人記得的護欄,只保護已經知道的人**。
  2026-09-04 起 CI 分成兩個 job:`checks`(兩個 app 的 tsc + lint + `npm test`)和
  `guards`(下面這幾支無症狀漂移的檢查)。`checks` 以前不存在,而 Next 16 的 `next build`
  不再跑 ESLint,所以 lint 紅了也擋不住任何東西。
- **每個 Supabase 寫入都要有人讀 `error`**:`npm run check:db-writes`。
  supabase-js 不 throw,寫入回 `{ data, error }` 兩邊都 resolve,所以沒人讀的 `error`
  是隱形的:路由回 200、toast 說已儲存、資料列不存在(pitfall #45)。
  慣例是 `throwIfDbError(label)(res)` / `logIfDbError(label, res)`,都在 **`@eg/db/errors`**
  (以前只是 generate-pdf 裡的一個區域閉包,所以「慣例」只有那一個檔案在遵守)。
  護欄第一次跑報 32 處、修好誤判後報 **67 處** —— 它把外層的 `if (x.length > 0)` 當成
  「有人在檢查」。真的不需要知道結果的寫入,用 `// db-write-unchecked: <理由>` 明講。
- **指南頁裡的 UI 標籤有護欄**：`npm run check:guide-labels`。
  `apps/spechub/public/docs/tender-datasheets.html` 裡包在 `<span data-ui>` 的字串
  是「這幾個字就在畫面上」的宣告,腳本拿去比對 `apps/spechub/src/`。
  **改按鈕/頁籤名字時它會叫**——改名的 PR 本來沒有任何理由去碰那份 HTML,
  已經靜靜過期兩次。只檢查被標記的字串,全篇比對會把每個提到功能的句子都掃進來,
  然後這支護欄就會被忽略。`〈…〉` 代表執行期才知道的值。
  **同一份指南的版型那一節也有護欄**：`npm run check:guide-layouts` 比對
  `PROJECT_LAYOUTS` 與頁面上的 `data-layout` / `data-hex`——改個顏色是一行，
  而那一節連截圖都會過期。
- migrations 在 `packages/db/supabase/migrations/`（supabase CLI 的 link 狀態 `.temp` 也在旁邊，`supabase db push` 從 `packages/db` 跑）
- ⚠️ **套 migration 的順序取決於依賴方向,不是編號**：拿掉 DB 依賴的（例如 00048 收掉
  RLS policy）要**先部署程式再套**;新增 DB 依賴的（00050 的 RPC、00051 的
  `match_documents_scoped`）要**先套再部署**。搞反的那一半會是靜默的
- **2026-09-03~04 的全專案 code review 與五波修正**（PR #49–#56, migrations 00048–00052）
  —— 三個 Critical 全在 RLS。動 RLS / auth / cron / sync / ingest 之前,
  先讀那幾支 migration 的註解和兩個 app 的 CLAUDE.md 開頭

- 套件管理：**npm workspaces**（root `npm install`；`npm run dev|build|lint` 預設轉發到 spechub，或 `-w <app>` 指定）
- 兩個 app 共用同一個 Supabase（project `xzolvtlqafwkxfuaryec`）；Vercel 各自一個專案、Root Directory 指到 `apps/<name>`，region 都釘 `hnd1`
- **兩個 app 都走 Vercel 原生 Git 整合部署**（2026-08-06 統一）。engenie 曾經因為
  「Vercel 雲端建置對新專案會失敗」而改用 GitHub Actions 建好再上傳（`deploy-engenie.yml`），
  Ignored Build Step 設成永遠跳過。**實測後發現真正的原因是 `apps/engenie` import 了
  `shadcn` 卻沒宣告依賴**（只宣告在 spechub，靠 workspace hoisting 在本機和 CI 蒙過去，
  Vercel 的單 app 安裝抓不到）。補上依賴後 Vercel 自己建得起來，workflow 已刪、
  Ignored Build Step 已改回 Automatic。
  ⚠️ **依賴一定要宣告在「真正 import 它的那個 app」** —— 同一天踩了兩次（`@eg/llm`、`shadcn`），
  兩次都是本機 build 全綠、只有 Vercel 會爆。**本機 build 過不代表依賴宣告對了。**
- **進 app 工作前先讀該 app 的 CLAUDE.md**：[apps/spechub/CLAUDE.md](apps/spechub/CLAUDE.md) · [apps/engenie/CLAUDE.md](apps/engenie/CLAUDE.md)
