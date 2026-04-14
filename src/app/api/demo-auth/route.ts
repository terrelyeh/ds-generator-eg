import { NextResponse } from "next/server";

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

  if (body.key !== expected) {
    return NextResponse.json({ ok: false, error: "Invalid key" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
