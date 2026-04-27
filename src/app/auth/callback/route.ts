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
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    const url = new URL("/auth/sign-in", origin);
    url.searchParams.set("error", "missing_code");
    return NextResponse.redirect(url);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const url = new URL("/auth/sign-in", origin);
    url.searchParams.set("error", error.message);
    return NextResponse.redirect(url);
  }

  // Hand off to the client-side redirector which reads sessionStorage.
  return NextResponse.redirect(new URL("/auth/redirecting", origin));
}
