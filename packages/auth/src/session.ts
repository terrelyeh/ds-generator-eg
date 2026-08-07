/**
 * Server-side helpers for reading the current authenticated user + their
 * role. Used by server components, route handlers, and API routes.
 *
 * - `getCurrentUser()` returns `null` if not signed in or no profile (e.g.
 *   not in the whitelist). Use this in server components when the page is
 *   public-ish (e.g. the navbar shows different things based on login).
 * - `requireUser()` throws if not signed in — use it in API routes that
 *   *must* have a logged-in user.
 * - `requireRole()` checks a permission and throws if the user lacks it.
 *
 * Auth state in this codebase is always cookie-based via @supabase/ssr.
 */

import { NextResponse } from "next/server";
import { createClient } from "@eg/db/server";
import { isRole, can, type Permission, type Role } from "./permissions";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: Role;
  /**
   * Locales this user may approve. `null` = all of them.
   *
   * Roles are global, so without this a `pm` brought in to review Spanish
   * could sign off on Japanese just as easily. Scoping lives here rather
   * than in RLS because every app query runs as service-role.
   */
  reviewLocales: string[] | null;
};

/** Returns the current user, or null if not signed in / not whitelisted. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const { data: authResult, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authResult?.user) return null;

  const authUser = authResult.user;
  if (!authUser.email) return null;

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, email, name, avatar_url, role, review_locales")
    .eq("id", authUser.id)
    .maybeSingle();

  if (profileErr || !profile) return null;
  if (!isRole(profile.role)) return null;

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    avatarUrl: profile.avatar_url,
    role: profile.role,
    reviewLocales:
      (profile as { review_locales?: string[] | null }).review_locales ?? null,
  };
}

/**
 * May this user approve or send back a translation in `locale`?
 *
 * Two independent gates: the role must carry review.approve at all, and
 * the locale must be inside their scope. An empty array means "no locales"
 * — only NULL is the wildcard, so scoping someone to nothing is possible
 * and means what it says.
 */
export function canReviewLocale(
  user: Pick<AuthUser, "role" | "reviewLocales"> | null | undefined,
  locale: string,
): boolean {
  if (!user || !can(user.role, "review.approve")) return false;
  if (user.reviewLocales === null) return true;
  return user.reviewLocales.includes(locale);
}

/** Like getCurrentUser but throws if not authenticated. For API routes. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError("Unauthorized — sign in required", 401);
  }
  return user;
}

/**
 * Require a specific permission. Throws AuthError on failure with the
 * appropriate HTTP status (401 unauth, 403 forbidden).
 */
export async function requirePermission(
  permission: Permission
): Promise<AuthUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) {
    throw new AuthError(
      `Forbidden — your role (${user.role}) cannot perform ${permission}`,
      403
    );
  }
  return user;
}

/**
 * Custom error type so route handlers can `catch (e instanceof AuthError)`
 * and return the right status code.
 */
export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/**
 * Concise route guard. Returns a 401/403 NextResponse if the caller lacks
 * the permission, else null. Usage in API routes:
 *
 *   const denied = await gate("pdf.generate");
 *   if (denied) return denied;
 *
 * Saves the boilerplate try/catch around requirePermission().
 */
export async function gate(
  permission: Permission
): Promise<NextResponse | null> {
  try {
    await requirePermission(permission);
    return null;
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/**
 * Cron-aware variant of {@link gate}. Returns null if the request is from
 * Vercel cron (or carries the CRON_SECRET bearer) OR the user has the
 * permission; returns a 401/403 NextResponse otherwise.
 */
export async function gateOrCron(
  request: Request,
  permission: Permission
): Promise<NextResponse | null> {
  try {
    await requirePermissionOrCron(request, permission);
    return null;
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

/**
 * Allow a request through if EITHER:
 *   - it's a Vercel cron invocation (carries `x-vercel-cron: 1`), OR
 *   - it includes the configured `CRON_SECRET` as a Bearer token, OR
 *   - the requesting user has the given permission.
 *
 * Use on routes that are normally user-driven but also called by cron
 * (currently `/api/sync` and `/api/notify`). Returns the user when the
 * caller is authenticated, or `null` when the caller is cron — most
 * route code only uses it for the side-effect of throwing on failure.
 */
export async function requirePermissionOrCron(
  request: Request,
  permission: Permission
): Promise<AuthUser | null> {
  // 1. Vercel cron — header is added by Vercel infra, can't be spoofed
  //    from outside the project.
  if (request.headers.get("x-vercel-cron")) {
    return null;
  }

  // 2. Manual cron-secret bearer (legacy / external triggers).
  const auth = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) {
    return null;
  }

  // 3. Otherwise, fall back to per-user permission check.
  return requirePermission(permission);
}

// ── Per-locale review policy ───────────────────────────────────────────

/**
 * Does this locale have someone explicitly assigned to review it?
 *
 * This is the switch between "MKT saves and it ships" and "MKT saves and
 * a reviewer has to sign off". A locale becomes reviewed simply by
 * scoping someone to it — no separate setting to keep in sync.
 *
 * ⚠️ Only an EXPLICIT list counts. `review_locales IS NULL` means "may
 * review anything" (admins), and if that counted, the first admin would
 * silently make every locale externally-reviewed and take one-click
 * approval away from ja and zh-TW.
 *
 * Admins are not locked out by this — they approve through the review
 * action instead of the save shortcut.
 */
const reviewerLocaleCache = new Map<string, { has: boolean; at: number }>();
const REVIEWER_CACHE_TTL_MS = 60_000;

export function invalidateReviewerLocaleCache(): void {
  reviewerLocaleCache.clear();
}

export async function localeHasDesignatedReviewer(locale: string): Promise<boolean> {
  const hit = reviewerLocaleCache.get(locale);
  if (hit && Date.now() - hit.at < REVIEWER_CACHE_TTL_MS) return hit.has;

  let has = false;
  try {
    const { createAdminClient } = await import("@eg/db/admin");
    const { data } = await createAdminClient()
      .from("profiles")
      .select("id")
      .not("review_locales", "is", null)
      .contains("review_locales", [locale])
      .limit(1);
    has = (data?.length ?? 0) > 0;
  } catch {
    // Fail open: a lookup failure must not block MKT from saving. The
    // reviewer can still send it back afterwards.
    has = false;
  }

  reviewerLocaleCache.set(locale, { has, at: Date.now() });
  return has;
}
