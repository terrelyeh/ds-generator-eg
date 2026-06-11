# CLAUDE.md — Monorepo Root

> Monorepo 拆分（branch `monorepo-split`，藍圖見
> [apps/spechub/docs/monorepo-split-plan.md](apps/spechub/docs/monorepo-split-plan.md)）。
> Phase 1–4 完成：app 搬入 `apps/spechub`、`@eg/db`+`@eg/auth` 抽出、
> `apps/engenie` 析出（Vercel 專案 `engenie-eg`）、CLAUDE.md 分家。
> 剩 Phase 5 切換（merge main + §6 驗收 + 更新 engenius-kb skill 的 API URL）。

## 結構

```
├── apps/
│   ├── spechub/        # Product SpecHub — datasheet/文件生成（Vercel: ds-generator-eg, port 3000）
│   └── engenie/        # EnGenie — Knowledge RAG + Ask（Vercel: engenie-eg, port 3100）
├── packages/
│   ├── db/             # @eg/db — supabase server/client/admin + settings accessor + DB types + supabase/migrations（唯一來源）
│   └── auth/           # @eg/auth — session.ts(gate/RBAC) + permissions.ts + page-guards.ts
└── package.json        # npm workspaces：apps/*, packages/*
```

跨 app 接點（sync→reindex 觸發、spechub widget、LLM keys 歸 engenie、
產品表唯讀約定）詳見兩個 app 的 CLAUDE.md「Monorepo 接點 / 跨 app 接點」章節。

- packages 直接輸出 `.ts`（package.json `exports` map），app 端用 `transpilePackages` 編譯；import 形式：`@eg/db/server|client|admin|settings|types`、`@eg/auth/session|permissions|page-guards`
- migrations 在 `packages/db/supabase/migrations/`（supabase CLI 的 link 狀態 `.temp` 也在旁邊，`supabase db push` 從 `packages/db` 跑）

- 套件管理：**npm workspaces**（root `npm install`；`npm run dev|build|lint` 預設轉發到 spechub，或 `-w <app>` 指定）
- 兩個 app 共用同一個 Supabase（project `xzolvtlqafwkxfuaryec`）；Vercel 各自一個專案、Root Directory 指到 `apps/<name>`，region 都釘 `hnd1`
- **進 app 工作前先讀該 app 的 CLAUDE.md**：[apps/spechub/CLAUDE.md](apps/spechub/CLAUDE.md)
