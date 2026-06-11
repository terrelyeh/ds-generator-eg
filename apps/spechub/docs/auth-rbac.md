# Authentication & RBAC

> Extracted from CLAUDE.md 2026-06-09 to keep CLAUDE.md scannable. Read when working on auth, the proxy, roles/permissions, or the sign-in flow.

### Authentication & RBAC

Three-layer enforcement:

1. **`src/proxy.ts`** (Next.js 16 — replaces `middleware.ts`) — refreshes
   Supabase session cookie on every request and redirects unauthenticated
   users to `/auth/sign-in`. `PUBLIC_PATH_PREFIXES`: `/auth/`, `/api/auth/`,
   `/demo/`, `/api/v1/`, `/ask/`; `SERVICE_PATHS`: `/api/sync`, `/api/cron`.
   `PUBLIC_EXACT_PATHS` = individually-public files — `/api/demo-auth`,
   `/api/ws-auth` + the **shareable docs** (`/docs/api-search.html`,
   `/docs/ask-chat-ux-spec.html`, `/docs/topology-icon-spec.html`). **To make a
   `/docs/*.html` shareable (no login), add it to `PUBLIC_EXACT_PATHS`** —
   proxy DOES run on `.html` (only listed static extensions bypass it). The
   `!user` branch also lets `/api/ask` through when a valid demo cookie OR any
   valid `ws_*` workspace cookie is present (`hasAnyValidWorkspaceCookie`).
   Wrapped in try/catch so any Edge runtime quirk falls through (defense in
   depth — the page layer still gates).
2. **`(main)/layout.tsx`** — server component runs `getCurrentUser()`. If
   the user has a Supabase session but no `profiles` row (i.e. email not in
   whitelist), signs them out and redirects to `/auth/no-access`.
3. **Per-route gates**:
   - API routes: `gate("permission")` returns 401/403 NextResponse on
     failure. `gateOrCron()` variant lets Vercel cron through via the
     `x-vercel-cron` header.
   - Server pages: `adminOnly()` / `requirePagePermission()` redirect
     non-authorised users to `/dashboard` before render.
   - Client UI: `can(role, "permission")` controls conditional rendering
     so PM/Viewer don't see buttons that would 403.

**Roles + permission matrix** in `lib/auth/permissions.ts`:

| Role | Capabilities |
|---|---|
| `admin` | Everything incl. user management, API keys, Personas, Ask Welcome |
| `editor` | Edit content, sync, generate PDF, translate, knowledge edit, **Glossary + Typography settings** |
| `pm` | Read-only + review workflow (no Ask, no Knowledge) |
| `viewer` | Read-only + Ask SpecHub (sales / field) |

Settings hub 用 `roles: ["admin"]` 過濾敏感卡片（API Keys、Ask Welcome、Ask Personas、Users）；Editor 只看到 Glossary + Typography 兩張。Settings 子頁守門用 `requirePagePermission("settings.edit_xxx")` 而非 `adminOnly()`，讓權限矩陣為單一真相來源。

**Sign-in flow** uses PKCE via `@supabase/ssr` browser client. Caveats:
- The post-login destination (`next`) is stashed in `sessionStorage`
  before kicking off OAuth, NOT on the `redirectTo` query string.
  Supabase validates `redirectTo` verbatim against allow-list — adding
  `?next=...` makes it fail validation and silently fall back to
  `site_url` (production). `/auth/callback` redirects to `/auth/redirecting`
  which is a tiny client page that reads sessionStorage and navigates.
- Whitelist match is case-insensitive (`LOWER(email)` in trigger).

**Trigger**: `handle_new_user` (SECURITY DEFINER) fires on `auth.users`
INSERT, looks up `email_whitelist`, creates `profiles` row with the
listed role. If email not in whitelist, no profile is created — middleware
handles that case downstream.

**RLS recursion gotcha** (see Pitfalls): admin-check policies on `profiles`
must use the `current_user_is_admin()` SECURITY DEFINER helper to bypass
RLS, otherwise a SELECT triggers the policy which itself does a SELECT →
infinite recursion → query fails.
