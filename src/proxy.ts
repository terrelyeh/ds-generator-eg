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
import { DEMO_COOKIE, isValidDemoToken } from "@/lib/auth/demo-session";

// Routes accessible without a session.
// /demo/ is the passcode-gated EnGenie surface — the page renders the
// passcode prompt itself (EngenieGate), so the page route is public.
// /api/demo-auth verifies the passcode and issues the demo cookie.
const PUBLIC_PATH_PREFIXES = ["/auth/", "/api/auth/", "/demo/"];
const PUBLIC_EXACT_PATHS = ["/api/demo-auth"];
// Routes accessible without enforcing whitelist (cron uses CRON_SECRET).
const SERVICE_PATHS = ["/api/sync", "/api/cron"];
// APIs the demo needs, reachable with a valid demo cookie (no Google login).
// Kept tight: only the read + ask endpoints the EnGenie UI calls.
const DEMO_API_PREFIXES = ["/api/ask", "/api/settings/providers"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (PUBLIC_EXACT_PATHS.includes(pathname)) return true;
  if (
    SERVICE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return true;
  }
  return false;
}

function isDemoApi(pathname: string): boolean {
  return DEMO_API_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({ request });

  // Internal automation bypass: our own Puppeteer (in /api/generate-pdf)
  // self-fetches /preview/[model] to render the PDF. Without this, the
  // request is treated as anonymous, redirected to /auth/sign-in, and
  // Puppeteer dutifully prints the sign-in page as the "PDF". Same
  // secret already gates Vercel Deployment Protection — extending it
  // to our app auth is a single trust boundary, not a new one.
  const automationSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (
    automationSecret &&
    request.headers.get("x-vercel-protection-bypass") === automationSecret
  ) {
    return NextResponse.next({ request });
  }

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

    // Not signed in with Google. Before redirecting, allow demo-permitted
    // APIs through if the request carries a valid passcode demo cookie —
    // this is how external (non-account) users reach /api/ask from the
    // EnGenie demo. The handlers re-verify the cookie too (defense in depth).
    if (!user) {
      if (
        isDemoApi(pathname) &&
        (await isValidDemoToken(request.cookies.get(DEMO_COOKIE)?.value))
      ) {
        return response;
      }
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
    "/((?!_next/static|_next/image|favicon.ico|logo/|images/|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|map|webmanifest)$).*)",
  ],
};
