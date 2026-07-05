import { NextResponse } from "next/server";
import { DEMO_COOKIE, computeDemoToken } from "@/lib/auth/demo-session";
import { passcodeAttemptAllowed, RATE_LIMIT_MSG } from "@/lib/auth/rate-limit";

export async function POST(request: Request) {
  const expected = process.env.DEMO_ACCESS_KEY;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "DEMO_ACCESS_KEY not configured" },
      { status: 500 },
    );
  }

  let body: { key?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  // Brute-force limiter — before the key comparison.
  if (!(await passcodeAttemptAllowed("demo", request))) {
    return NextResponse.json({ ok: false, error: RATE_LIMIT_MSG }, { status: 429 });
  }

  if (body.key !== expected) {
    return NextResponse.json({ ok: false, error: "Invalid key" }, { status: 401 });
  }

  // Correct passcode → issue an HMAC-signed demo session cookie. The proxy
  // and the demo-permitted API handlers (/api/ask, /api/settings/providers)
  // verify it so passcode users reach the demo without a Google login.
  const token = await computeDemoToken();
  const res = NextResponse.json({ ok: true });
  if (token) {
    res.cookies.set(DEMO_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12, // 12h
    });
  }
  return res;
}
