/**
 * Server-component page guards. Use at the top of an async server page to
 * redirect users who lack the necessary role/permission. Belt-and-braces:
 * API routes are also gated separately, but this prevents non-admins from
 * even rendering admin-only pages.
 *
 *   export default async function MyAdminPage() {
 *     await adminOnly();
 *     return <SomeAdminUI />;
 *   }
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "./session";
import { can, type Permission, type Role } from "./permissions";

/**
 * Where a guard sends someone who may not see the page.
 *
 * Was "/dashboard", which only one of the two apps has: EnGenie's settings
 * pages sent a non-admin to a 404. Each app's root already redirects to its
 * own home (SpecHub → /dashboard, EnGenie → /ask), so "/" is the one
 * destination that is right in both.
 */
const DEFAULT_FALLBACK = "/";

/** Redirects home if the user isn't an admin. */
export async function adminOnly(redirectTo = DEFAULT_FALLBACK) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    redirect(redirectTo);
  }
  return user;
}

/** Redirects unless the user has the given permission. */
export async function requirePagePermission(
  permission: Permission,
  redirectTo = DEFAULT_FALLBACK
) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, permission)) {
    redirect(redirectTo);
  }
  return user;
}

/** Redirects unless the user's role is one of the allowed roles. */
export async function requireRoles(
  allowedRoles: Role[],
  redirectTo = DEFAULT_FALLBACK
) {
  const user = await getCurrentUser();
  if (!user || !allowedRoles.includes(user.role)) {
    redirect(redirectTo);
  }
  return user;
}
