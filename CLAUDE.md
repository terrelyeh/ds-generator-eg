# CLAUDE.md — Monorepo Root

> Monorepo 拆分進行中（branch `monorepo-split`，藍圖見
> [apps/spechub/docs/monorepo-split-plan.md](apps/spechub/docs/monorepo-split-plan.md)）。
> Phase 1 完成（app 搬入 `apps/spechub`、Vercel Root Directory 已改）；
> Phase 2 完成（`@eg/db` + `@eg/auth` 抽出，spechub import 已改寫）。

## 結構

```
├── apps/
│   ├── spechub/        # Product SpecHub — datasheet/文件生成平台（完整 context 見 apps/spechub/CLAUDE.md）
│   └── engenie/        # (Phase 3) EnGenie — Knowledge RAG + Ask 平台
├── packages/
│   ├── db/             # @eg/db — supabase server/client/admin + settings accessor + DB types + supabase/migrations（唯一來源）
│   └── auth/           # @eg/auth — session.ts(gate/RBAC) + permissions.ts + page-guards.ts
└── package.json        # npm workspaces：apps/*, packages/*
```

- packages 直接輸出 `.ts`（package.json `exports` map），app 端用 `transpilePackages` 編譯；import 形式：`@eg/db/server|client|admin|settings|types`、`@eg/auth/session|permissions|page-guards`
- migrations 在 `packages/db/supabase/migrations/`（supabase CLI 的 link 狀態 `.temp` 也在旁邊，`supabase db push` 從 `packages/db` 跑）

- 套件管理：**npm workspaces**（root `npm install`；`npm run dev|build|lint` 預設轉發到 spechub，或 `-w <app>` 指定）
- 兩個 app 共用同一個 Supabase（project `xzolvtlqafwkxfuaryec`）；Vercel 各自一個專案、Root Directory 指到 `apps/<name>`，region 都釘 `hnd1`
- **進 app 工作前先讀該 app 的 CLAUDE.md**：[apps/spechub/CLAUDE.md](apps/spechub/CLAUDE.md)
