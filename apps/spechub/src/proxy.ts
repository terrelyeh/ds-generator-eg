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
 * The public Ask surfaces (/ask/<slug>, /embed, /demo, /api/v1) moved to
 * the EnGenie app with the monorepo split — this proxy is now just
 * auth gate + automation bypass.
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
const SERVICE_PATHS = ["/api/sync"];
/**
 * Individually published pages — world-readable, no account needed.
 *
 * Matched EXACTLY, not by prefix. The design reference is shared with
 * outside designers who have no SpecHub login, but "/design/" as a prefix
 * would mean anything later dropped in public/design/ is published the
 * moment it lands. Adding a page here has to be a deliberate act.
 *
 * Anything listed is genuinely public: assume it will be found. The type
 * spec carries product line names and model counts, which was accepted
 * when it was published; it is served with <meta name="robots"
 * content="noindex"> so it stays out of search results.
 */
const PUBLIC_EXACT_PATHS = ["/design/datasheet-type-spec.html"];

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
    "/((?!_next/static|_next/image|favicon.ico|logo/|images/|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|map|webmanifest)$).*)",
  ],
};
