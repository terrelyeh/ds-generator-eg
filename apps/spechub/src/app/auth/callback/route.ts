/**
 * OAuth callback for Google sign-in.
 *
 * Supabase redirects here after Google approves the user, with `?code=...`.
 * We exchange the code for a session, then send the user to a small client
 * page (/auth/redirecting) that reads the post-login destination from
 * sessionStorage. We can't put `?next=` on the OAuth `redirectTo` because
 * Supabase validates `redirectTo` against the allow-list with query string
 * intact — adding params makes the URL fail validation and Supabase
 * silently falls back to `site_url` (production).
 *
 * If exchange fails, redirect to /auth/sign-in with an error param so the
 * user sees what went wrong.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@eg/db/server";
import { getCurrentUser } from "@eg/auth/session";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Supabase / OAuth provider can return an error directly (mismatched
  // redirect, invalid state, user denied consent, etc.). Surface those
  // verbatim so we can debug instead of swallowing them as "missing_code".
  const oauthError =
    searchParams.get("error") ||
    searchParams.get("error_code") ||
    searchParams.get("error_description");

  // Capture every query param for diagnostics. Logged once per failed
  // callback; safe because OAuth params don't contain user PII beyond
  // the code which we redact below.
  if (!code || oauthError) {
    const debugParams: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      debugParams[key] = key === "code" ? "<redacted>" : value;
    });
    console.warn(
      "[auth/callback] redirected here without usable code; params=",
      debugParams
    );
    const url = new URL("/auth/sign-in", origin);
    url.searchParams.set(
      "error",
      oauthError ||
        `missing_code; got: ${
          Object.keys(debugParams).join(",") || "no params"
        }`
    );
    return NextResponse.redirect(url);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.warn("[auth/callback] exchangeCodeForSession failed:", error);
    const url = new URL("/auth/sign-in", origin);
    url.searchParams.set("error", error.message);
    return NextResponse.redirect(url);
  }

  // Whitelist check, here rather than only in `(main)/layout.tsx`.
  //
  // Google will hand a session to any account that completes consent, and
  // `handle_new_user` deliberately creates no profile row for an email that
  // is not on the whitelist. The layout catches that — but a layout only
  // runs for a page, so between this redirect and the first page render the
  // holder of that session can talk to `/api/*` and to PostgREST as the
  // `authenticated` role. Ending it here closes that window at its source.
  const user = await getCurrentUser();
  if (!user) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/auth/no-access", origin));
  }

  // Hand off to the client-side redirector which reads sessionStorage.
  return NextResponse.redirect(new URL("/auth/redirecting", origin));
}
