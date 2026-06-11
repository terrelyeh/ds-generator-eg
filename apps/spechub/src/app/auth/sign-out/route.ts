/**
 * Sign-out endpoint. POST clears the session cookie + revokes refresh
 * token, then redirects to /auth/sign-in.
 *
 * GET is also accepted so a plain anchor link works (some places we
 * just want a regular `<a href="/auth/sign-out">`). For CSRF safety
 * we keep this safe-by-default — signing out of your own session has
 * essentially no attack surface.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function handler(request: NextRequest): Promise<Response> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/auth/sign-in", request.url));
}

export async function GET(request: NextRequest) {
  return handler(request);
}
export async function POST(request: NextRequest) {
  return handler(request);
}
