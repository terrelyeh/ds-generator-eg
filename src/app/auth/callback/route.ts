/**
 * OAuth callback for Google sign-in.
 *
 * Supabase redirects here after Google approves the user, with `?code=...`
 * (and our own `?next=...` we tacked on before redirecting to Google).
 * We exchange the code for a session, then redirect to `next` (or `/`).
 *
 * If exchange fails, redirect to /auth/sign-in with an error param so the
 * user sees what went wrong.
 *
 * Whitelist enforcement happens in middleware on the *next* request — the
 * trigger created the profile (or didn't) when auth.users got the new row.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

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

  return NextResponse.redirect(new URL(next, origin));
}
