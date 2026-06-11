# CLAUDE.md — Monorepo Root

> Monorepo 拆分進行中（branch `monorepo-split`，藍圖見
> [apps/spechub/docs/monorepo-split-plan.md](apps/spechub/docs/monorepo-split-plan.md)）。
> Phase 1 完成：現有 app 原樣搬入 `apps/spechub`，npm workspaces 就位。

## 結構

```
├── apps/
│   ├── spechub/        # Product SpecHub — datasheet/文件生成平台（現有 app，完整 context 見 apps/spechub/CLAUDE.md）
│   └── engenie/        # (Phase 3) EnGenie — Knowledge RAG + Ask 平台
├── packages/
│   ├── db/             # (Phase 2) supabase clients + settings + migrations（唯一來源）
│   └── auth/           # (Phase 2) session/RBAC/page-guards
└── package.json        # npm workspaces：apps/*, packages/*
```

- 套件管理：**npm workspaces**（root `npm install`；`npm run dev|build|lint` 預設轉發到 spechub，或 `-w <app>` 指定）
- 兩個 app 共用同一個 Supabase（project `xzolvtlqafwkxfuaryec`）；Vercel 各自一個專案、Root Directory 指到 `apps/<name>`，region 都釘 `hnd1`
- **進 app 工作前先讀該 app 的 CLAUDE.md**：[apps/spechub/CLAUDE.md](apps/spechub/CLAUDE.md)
