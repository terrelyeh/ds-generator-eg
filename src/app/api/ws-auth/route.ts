import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { loadWorkspaceBySlug } from "@/lib/ask/workspaces";
import { workspaceCookieName, computeWorkspaceToken } from "@/lib/auth/workspace-session";

/**
 * POST /api/ws-auth { slug, key } — verify a workspace's passcode and, on
 * success, set the `ws_<slug>` session cookie. Public at the proxy; this
 * handler does the verification.
 */
export async function POST(request: Request) {
  let body: { slug?: string; key?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const slug = (body.slug || "").trim();
  if (!slug) return NextResponse.json({ ok: false, error: "Missing slug" }, { status: 400 });

  const ws = await loadWorkspaceBySlug(slug);
  if (!ws || !ws.enabled) {
    return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
  }

  // If a passcode is set, it must match (sha256). No passcode = open workspace.
  if (ws.passcode_hash) {
    const h = createHash("sha256").update(String(body.key ?? "")).digest("hex");
    if (h !== ws.passcode_hash) {
      return NextResponse.json({ ok: false, error: "Invalid passcode" }, { status: 401 });
    }
  }

  const token = await computeWorkspaceToken(slug);
  const res = NextResponse.json({ ok: true, name: ws.name });
  if (token) {
    res.cookies.set(workspaceCookieName(slug), token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12, // 12h
    });
  }
  return res;
}
