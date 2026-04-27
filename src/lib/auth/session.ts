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

import { createClient } from "@/lib/supabase/server";
import { isRole, can, type Permission, type Role } from "./permissions";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: Role;
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
    .select("id, email, name, avatar_url, role")
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
  };
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
