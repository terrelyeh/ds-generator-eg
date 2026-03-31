# EnGenius Datasheet System — Next.js

## Tech Stack
- **Framework**: Next.js 16 (App Router) + TypeScript
- **UI**: Tailwind CSS v4 + shadcn/ui
- **Backend**: Supabase (Postgres + Storage + Auth + Edge Functions)
- **Deployment**: Vercel
- **Data Source**: Google Sheets API → synced to Supabase

## Next.js 16 Breaking Changes (IMPORTANT)
- `params` and `searchParams` are **Promises** — must be awaited
- `cookies()` and `headers()` are **async** — must be awaited
- Fetch requests are **not cached by default**
- Use `'use client'` directive for client components (state, hooks, events)
- Server Components are the default (no directive needed)

## Directory Structure
```
src/
  app/
    page.tsx              # Redirects to /dashboard
    layout.tsx            # Root layout with Navbar + Toaster
    dashboard/page.tsx    # Server component: product list
    product/[model]/      # Product detail with specs, versions
    preview/[model]/      # Datasheet HTML preview (for PDF)
    api/sync/             # Google Sheets → Supabase sync endpoint
    api/generate-pdf/     # Server-side PDF generation
  components/
    layout/navbar.tsx     # Top navigation bar
    dashboard/            # Dashboard page components
    product/              # Product detail components
    ui/                   # shadcn/ui primitives
  lib/
    supabase/client.ts    # Browser Supabase client
    supabase/server.ts    # Server Supabase client (with cookies)
    supabase/admin.ts     # Admin client (bypasses RLS)
    utils.ts              # cn() utility
  types/
    database.ts           # Supabase DB types
  middleware.ts           # Session refresh middleware
supabase/
  migrations/             # SQL migration files
public/
  logo/                   # EnGenius logos
```

## Brand Colors
- Primary Blue: `#03a9f4` → `text-engenius-blue`, `bg-engenius-blue`
- Dark Text: `#231f20` → `text-engenius-dark`
- Gray Text: `#6f6f6f` → `text-engenius-gray`
- NO pure black `#000000`

## Database Tables
product_lines → products → spec_sections → spec_items
products → hardware_labels, image_assets, versions, change_logs
auth.users → profiles

## Key Commands
```bash
npm run dev    # Local dev server
npm run build  # Production build
npm run lint   # ESLint check
```
