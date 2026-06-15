/**
 * Next.js 16 proxy (formerly middleware). Runs on Edge runtime.
 *
 * EnGenie variant — same two responsibilities as SpecHub's proxy
 * (session-cookie refresh + auth gate) plus the demo/workspace
 * pass-throughs and the widget-embed CSP, because all public Ask
 * surfaces (/ask/<slug>, /embed/<slug>, /demo, /api/v1) live here.
 *
 * Whitelist enforcement (does the user have a profiles row?) happens in
 * (main)/layout.tsx via getCurrentUser() — Node runtime, full DB access.
 */

import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { DEMO_COOKIE, isValidDemoToken } from "@/lib/auth/demo-session";
import { hasAnyValidWorkspaceCookie, isValidWorkspaceBearer } from "@/lib/auth/workspace-session";

// Routes accessible without a session.
// /demo/ is the passcode-gated EnGenie surface — the page renders the
// passcode prompt itself (EngenieGate), so the page route is public.
// /api/demo-auth verifies the passcode and issues the demo cookie.
// /api/v1/ is the external (department) API surface — it authenticates via its
// own API-key Bearer check and returns JSON errors, so it must bypass the
// session redirect (an HTML 307 to sign-in would break machine clients).
// /ask/ are the per-department workspace chat entries — each renders its own
// passcode gate (like /demo/), so the page route is public; the chat API
// (/api/ask) is authorised below via the workspace cookie.
const PUBLIC_PATH_PREFIXES = ["/auth/", "/api/auth/", "/demo/", "/api/v1/", "/ask/", "/embed/"];
// Publicly-shareable docs — handed to people without an EnGenie login (other
// departments, RD/PM, the design team), so they bypass the session redirect.
// Add a doc here only when it's meant to be shared and contains no secrets.
const PUBLIC_EXACT_PATHS = [
  "/api/demo-auth",
  "/api/ws-auth",              // workspace passcode → cookie (self-verifies)
  "/docs/api-search.html",      // external RAG Search API spec (integrators)
  "/docs/ask-chat-ux-spec.html", // Ask chat UX spec (RD / PM)
  "/docs/topology-icon-spec.html", // topology icon spec (design team)
  "/docs/ask-integration.html", // Ask Workspace integration service intro (departments)
  "/docs/widget-demo.html",     // standalone widget showcase (fake-data demo page)
  "/docs/agent-architecture.html",        // agent architecture (single-agent) — shareable
  "/docs/multi-agent-architecture.html",  // multi-agent architecture — shareable
  "/docs/engenie-knowledge-mcp.html",     // EnGenie Knowledge MCP design — shareable
];
// Routes accessible without enforcing whitelist (cron uses CRON_SECRET).
const SERVICE_PATHS = ["/api/cron"];
// APIs the demo needs, reachable with a valid demo cookie (no Google login).
// Kept tight: only the read + ask endpoints the EnGenie UI calls.
const DEMO_API_PREFIXES = ["/api/ask", "/api/settings/providers", "/api/topology-icons"];

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

/**
 * ① Widget origin allow-list. Look up a workspace's allowed_origins via a
 * lightweight PostgREST GET (service key). Kept tiny and fail-open: any error /
 * timeout returns null → no CSP set → unrestricted (the prior behaviour), never
 * a blocked widget. Only runs for /embed/<slug> (rare traffic).
 */
async function embedAllowedOrigins(slug: string): Promise<string[] | null> {
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!base || !key || !/^[a-z0-9-]+$/.test(slug)) return null;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const r = await fetch(
      `${base}/rest/v1/ask_workspaces?slug=eq.${slug}&select=allowed_origins&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: ctrl.signal },
    );
    clearTimeout(t);
    if (!r.ok) return null;
    const rows = (await r.json()) as { allowed_origins?: unknown }[];
    const ao = rows?.[0]?.allowed_origins;
    return Array.isArray(ao) ? ao.filter((s): s is string => typeof s === "string" && !!s) : null;
  } catch {
    return null;
  }
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

    // ① Restrict which parent sites may iframe the widget. Browser-enforced via
    // CSP frame-ancestors on the /embed/<slug> document; empty allow-list →
    // no header → unrestricted (v1 default).
    if (pathname.startsWith("/embed/")) {
      const slug = pathname.slice("/embed/".length).split("/")[0];
      const origins = slug ? await embedAllowedOrigins(slug) : null;
      if (origins && origins.length > 0) {
        response.headers.set("Content-Security-Policy", `frame-ancestors 'self' ${origins.join(" ")}`);
      }
    }

    if (isPublic(pathname)) {
      return response;
    }

    // Not signed in with Google. Before redirecting, allow demo-permitted
    // APIs (/api/ask, …) through if the request carries a valid passcode demo
    // cookie OR any valid workspace cookie (per-department /ask/<slug>). The
    // handlers re-verify the specific cookie too (defense in depth).
    if (!user) {
      if (
        isDemoApi(pathname) &&
        ((await isValidDemoToken(request.cookies.get(DEMO_COOKIE)?.value)) ||
          (await hasAnyValidWorkspaceCookie(request.cookies.getAll())) ||
          // Embedded widgets (cross-site iframe, no cookies) carry a bearer token.
          (await isValidWorkspaceBearer(request.headers.get("authorization"))))
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
    "/((?!_next/static|_next/image|favicon.ico|logo/|widget.js|demo-icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|map|webmanifest)$).*)",
  ],
};
