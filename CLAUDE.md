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
│   ├── db/             # @eg/db — supabase server/client/admin + settings accessor + DB types + supabase/migrations（唯一來源）
│   ├── auth/           # @eg/auth — session.ts(gate/RBAC) + permissions.ts + page-guards.ts
│   └── llm/            # @eg/llm — OpenRouter chat client（chat completions 統一入口；**embedding 不走這裡**）
└── package.json        # npm workspaces：apps/*, packages/*
```

跨 app 接點（sync→reindex 觸發、spechub widget、LLM keys 歸 engenie、
產品表唯讀約定）詳見兩個 app 的 CLAUDE.md「Monorepo 接點 / 跨 app 接點」章節。

- packages 直接輸出 `.ts`（package.json `exports` map），app 端用 `transpilePackages` 編譯；import 形式：`@eg/db/server|client|admin|settings|types`、`@eg/auth/session|permissions|page-guards`
- migrations 在 `packages/db/supabase/migrations/`（supabase CLI 的 link 狀態 `.temp` 也在旁邊，`supabase db push` 從 `packages/db` 跑）

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
