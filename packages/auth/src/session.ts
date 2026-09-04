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

import { timingSafeEqual } from "node:crypto";
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
 * Cron-only entry: the shared secret, and nothing else.
 *
 * Separate from {@link gateOrCron} because Vercel Cron issues a **GET**, and
 * a GET is also what a browser sends when somebody clicks a link — with
 * cookies attached. So a cron-reachable GET must not also accept a user
 * session, or a link to `/api/sync?force=true` is a one-click full resync for
 * anyone already signed in. This accepts the bearer and refuses everything
 * else; people use the POST.
 */
export async function requireCron(request: Request): Promise<NextResponse | null> {
  const auth = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth && secretsMatch(auth, `Bearer ${cronSecret}`)) {
    return null;
  }
  return NextResponse.json(
    { error: "Unauthorized — this endpoint is invoked by cron" },
    { status: 401 },
  );
}

/** Compare two secrets without leaking their common prefix through timing. */
function secretsMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, which would itself be a
  // length oracle; compare a fixed-size digest-shaped pair instead by
  // rejecting early only on length, which the attacker already controls.
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/**
 * Allow a request through if EITHER:
 *   - it includes the configured `CRON_SECRET` as a Bearer token, OR
 *   - the requesting user has the given permission.
 *
 * Use on routes that are normally user-driven but also called by cron
 * (currently `/api/sync`, `/api/notify` and EnGenie's two re-index jobs).
 * Returns the user when the caller is authenticated, or `null` when the
 * caller is cron — most route code only uses it for the side-effect of
 * throwing on failure.
 *
 * ⚠️ There used to be a third way in: any request carrying an
 * `x-vercel-cron` header was let straight through, on the belief that only
 * Vercel's infrastructure could set it. It is not documented as a header
 * Vercel strips from inbound requests, and a probe against production
 * confirmed it: `curl -H 'x-vercel-cron: 1'` ran a re-index that the same
 * request without the header was refused. Vercel sends
 * `Authorization: Bearer $CRON_SECRET` itself, so the bearer branch below is
 * the whole mechanism and the header branch bought nothing.
 */
export async function requirePermissionOrCron(
  request: Request,
  permission: Permission
): Promise<AuthUser | null> {
  // 1. Cron secret bearer — what Vercel Cron sends, and what an external
  //    trigger has to present.
  const auth = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth && secretsMatch(auth, `Bearer ${cronSecret}`)) {
    return null;
  }

  // 2. Otherwise, fall back to per-user permission check.
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

/**
 * Every locale someone is explicitly scoped to review.
 *
 * The translation editor needs this before the first save: the button has
 * to read "submit for review" rather than "Save & Confirm" on a locale the
 * user cannot approve, and it can only know that up front by being told.
 *
 * Same rule as localeHasDesignatedReviewer — review_locales IS NULL is an
 * unscoped reviewer, not a designation of every locale — so the two can't
 * disagree about whether a locale is reviewed.
 */
export async function localesWithDesignatedReviewer(): Promise<string[]> {
  try {
    const { createAdminClient } = await import("@eg/db/admin");
    const { data } = await createAdminClient()
      .from("profiles")
      .select("review_locales")
      .not("review_locales", "is", null);

    const rows = (data ?? []) as unknown as { review_locales: string[] | null }[];
    return [...new Set(rows.flatMap((r) => r.review_locales ?? []))];
  } catch {
    // Fail open, like the singular version: an empty list means the editor
    // shows the ordinary Save & Confirm, and the server still refuses to
    // approve on a reviewed locale.
    return [];
  }
}
