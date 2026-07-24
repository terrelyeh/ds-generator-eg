# File Structure — Product SpecHub (apps/spechub)

不是完整清單，只列一個新 session 需要知道的位置。

```
src/
  app/
    (main)/                            # ⚠️ 白名單 gate — headless 驗不了（pitfall #62）
      dashboard/[solution]/page.tsx    # Per-solution dashboard (reads ?line= for tab)
      compare/[line]/page.tsx
      changelog/[line]/page.tsx
      product/[model]/page.tsx         # Product detail (sticky header, tabs: Detail/Translations)
      translations/[line]/page.tsx     # Per-product-line spec label translations
      battlecard/[line]/page.tsx       # Internal competitor battlecard (Cloud AP MVP)
      docs/sync/page.tsx
      settings/                        # hub + glossary / typography / users
    auth/                              # Google OAuth flow（與 engenie 各持一份）
    (print)/                           # ✅ 帶 bypass header 可 headless 抓
      preview/[model]/page.tsx         # Per-model datasheet（?lang=ja&mode=full&toolbar=false）
        ├ datacenter-preview.tsx       #   Data Center navy 變體
        └ broadband-preview.tsx        #   Broadband 鋼藍，per-model + series 雙 scope
      preview/series/[line]/page.tsx   # Series datasheet，依 category 分派
        └ edge-ai-series-preview.tsx   #   Edge AI teal（series only）
    api/
      sync/route.ts                    # Sheets → Supabase sync + 觸發 EnGenie re-index
      generate-pdf/route.ts            # Puppeteer PDF + lock；?model= 或 ?line=（series）
      resync-product/、resync-versions/、detect-locale-version/
      upload-image/route.ts            # Upload to Supabase + Google Drive
      translate/route.ts               # AI translation endpoint (multi-provider)
      translations/{product,spec-labels}/、glossary/
      settings/{providers,typography,fonts}/  # providers 與 engenie 各持一份
      products/[model]/layout-ack/
      battlecard/{value,matchup,resync,websearch,confirm-all}/  # 競品比較 CRUD + 抽取
      notify/、users/*                  # Telegram 通知、admin user management
  proxy.ts                             # session refresh + auth gate + Puppeteer automation bypass
  components/
    layout/{navbar,main-shell,user-menu,engenie-widget,solution-sidebar}.tsx
    dashboard/、product/、compare/、changelog/、translations/、preview/、battlecard/
    settings/{settings-page,glossary-editor,typography-editor,users-manager}.tsx
    ui/                                # shadcn（與 engenie 各持一份）
  lib/
    google/{auth,sheets,sheets-extra,drive-versions,drive-images}.ts
    datasheet/                         # cover-layout、pagination、layout-check、layout-ack、
                                       #   typography、locales/、qr.ts、radio-patterns.ts
    translate/                         # prompts + providers (claude/openai/gemini)
    battlecard/spec-mapping.ts         # dimension_key → EnGenius spec label 對應(自家值 seed 用)
    notifications/
packages/（repo root）
  db/    → @eg/db：supabase server/client/admin、settings(getApiKey)、DB types、supabase/migrations/
  auth/  → @eg/auth：session(gate/gateOrCron)、permissions(can/矩陣)、page-guards(adminOnly…)
```

## 放東西的規則

- **「依 category 而異」的判斷放 `lib/datasheet/qr.ts`**（`usesContactUsQr` /
  `usesTwoHardwareImages`），不要在元件內就地判斷 —— 散在三處的後果見 pitfall #61。
  Antenna pattern 的 slot 推導同理，放 `lib/datasheet/radio-patterns.ts`。
- **結構性不同的 datasheet 版型自己開一個組件**，在 `preview/[model]/page.tsx`
  （或 series 路由）頂部依 category 分派。URL 維持 `/preview/{model}`，
  generate-pdf 和產品頁連結都不用改。
  Cloud / gray / transceiver 這種只差顏色的，留在 `page.tsx` 用 `getTheme` 處理。
- **migrations 一律 `packages/db/supabase/migrations/`**，不要放 app 底下。
