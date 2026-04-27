/**
 * Next.js 16 proxy (formerly middleware). Runs on Edge runtime.
 *
 * Two responsibilities — kept deliberately minimal so Edge cold-starts
 * stay fast and the proxy doesn't crash on slow/flaky DB queries:
 *
 *   1. Refresh the Supabase session cookie on every request (required by
 *      @supabase/ssr — access tokens expire after 1 hour and are refreshed
 *      transparently via cookies).
 *   2. Auth gate. Public routes pass through; otherwise we require an
 *      authenticated Supabase session. If absent, redirect to sign-in.
 *
 * Whitelist enforcement (does the user have a profiles row?) happens in
 * (main)/layout.tsx via getCurrentUser() — Node runtime, full DB access.
 * Doing the DB query in Edge proved unreliable (Edge function 500s).
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

  // Public routes still get session refresh, but no gating.
  // We do the supabase setup unconditionally so cookies stay fresh.
  try {
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

    // Signed in. Profile/whitelist check happens downstream in
    // (main)/layout.tsx via getCurrentUser().
    return response;
  } catch (err) {
    // If anything in the proxy fails (Edge runtime quirk, network blip),
    // don't take the whole site down. Let the request through and log so
    // we can find out about it. The downstream layout will still gate.
    console.error("[proxy] error, falling through:", err);
    return response;
  }
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
