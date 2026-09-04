import { NextResponse } from "next/server";
import { logIfDbError } from "@eg/db/errors";
import { hashPasscode, isLegacyHash, verifyPasscode } from "@/lib/auth/passcode";
import { createAdminClient } from "@eg/db/admin";
import { loadWorkspaceBySlug } from "@/lib/ask/workspaces";
import { workspaceCookieName, computeWorkspaceToken } from "@/lib/auth/workspace-session";
import { passcodeAttemptAllowed, RATE_LIMIT_MSG } from "@/lib/auth/rate-limit";

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

  // Before ANY lookup/verification: brute-force limiter (also covers slug
  // enumeration, and removes the found-vs-wrong-passcode timing difference).
  if (!(await passcodeAttemptAllowed(`ws:${slug}`, request))) {
    return NextResponse.json({ ok: false, error: RATE_LIMIT_MSG }, { status: 429 });
  }

  const ws = await loadWorkspaceBySlug(slug);
  if (!ws || !ws.enabled) {
    return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
  }

  // If a passcode is set, it must match. No passcode = open workspace.
  if (ws.passcode_hash) {
    const key = String(body.key ?? "");
    if (!verifyPasscode(key, ws.passcode_hash)) {
      return NextResponse.json({ ok: false, error: "Invalid passcode" }, { status: 401 });
    }
    // A bare sha256 hash that just verified is upgraded on the spot, so the
    // table migrates itself as people sign in (see lib/auth/passcode.ts).
    if (isLegacyHash(ws.passcode_hash)) {
      logIfDbError(
        `ws-auth ${slug} passcode rehash`,
        await createAdminClient()
          .from("ask_workspaces" as "products")
          .update({ passcode_hash: hashPasscode(key) } as never)
          .eq("slug", slug),
      );
    }
  }

  const token = await computeWorkspaceToken(slug, ws.token_version);
  // Return the token in the body too: embeddable widgets run in a cross-site
  // iframe (third-party cookies blocked) and store it to send as a bearer header.
  const res = NextResponse.json({ ok: true, name: ws.name, token });
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
