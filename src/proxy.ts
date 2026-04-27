/**
 * Next.js 16 proxy (formerly middleware). Two responsibilities:
 *
 *   1. Refresh the Supabase session cookie on every request (required by
 *      @supabase/ssr — access tokens expire after 1 hour and are refreshed
 *      transparently via cookies).
 *   2. Gate access. Public routes pass through; otherwise we require both
 *      a Supabase session AND a matching profile row. If the user signed
 *      in via Google but isn't whitelisted (no profile), we sign them out
 *      and redirect to /auth/no-access.
 */

import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Routes accessible without a session.
const PUBLIC_PATH_PREFIXES = ["/auth/", "/api/auth/"];
// Routes accessible without enforcing whitelist (cron uses CRON_SECRET).
const SERVICE_PATHS = ["/api/sync", "/api/cron"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (
    SERVICE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return true;
  }
  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Calling getUser() also refreshes the access token if needed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public route: pass through with refreshed cookies.
  if (isPublic(pathname)) {
    return response;
  }

  // Not signed in → redirect to sign-in, preserving the destination.
  if (!user) {
    const signInUrl = new URL("/auth/sign-in", request.url);
    if (pathname !== "/") {
      signInUrl.searchParams.set("next", pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(signInUrl);
  }

  // Signed in via Google but not in whitelist (no profile row) → sign out
  // + show no-access page. Goes through RLS; the "users read own profile"
  // policy lets a user see their own row.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/auth/no-access", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match everything except Next.js internals + static assets. We DO match
     * /api routes — auth gating applies there too. Routes that need to
     * bypass (cron) are handled in `isPublic()` above.
     */
    "/((?!_next/static|_next/image|favicon.ico|logo/|images/|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|map)$).*)",
  ],
};
