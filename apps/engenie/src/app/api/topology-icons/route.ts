import { NextResponse } from "next/server";
import { createAdminClient } from "@eg/db/admin";
import { gate } from "@eg/auth/session";
import { cookies } from "next/headers";
import { DEMO_COOKIE, isValidDemoToken } from "@/lib/auth/demo-session";

/**
 * GET /api/topology-icons
 *
 * Returns the product-icon catalog the topology renderer uses to resolve a
 * diagram node (model/role) → image URL. Prefers the `b` (side iso) view since
 * that's the topology angle; falls back to a/default. Reachable by logged-in
 * Ask users OR a passcode demo session (same gate as /api/ask).
 */
async function gateAskOrDemo(): Promise<NextResponse | null> {
  const c = await cookies();
  if (await isValidDemoToken(c.get(DEMO_COOKIE)?.value)) return null;
  return gate("ask.use");
}

export async function GET() {
  const denied = await gateAskOrDemo();
  if (denied) return denied;

  const supabase = createAdminClient();
  const { data } = (await supabase
    .from("topology_icons" as "products")
    .select("key, view, role, url, label")) as {
    data: { key: string; view: string; role: string | null; url: string; label: string | null }[] | null;
  };

  // One entry per key, preferring the side-iso (b) view used in topology.
  const rank = (v: string) => (v === "b" ? 3 : v === "a" ? 2 : v === "default" ? 1 : 0);
  const byKey = new Map<string, { key: string; url: string; role: string | null; label: string | null; r: number }>();
  for (const row of data ?? []) {
    const cur = byKey.get(row.key);
    if (!cur || rank(row.view) > cur.r) {
      byKey.set(row.key, { key: row.key, url: row.url, role: row.role, label: row.label, r: rank(row.view) });
    }
  }
  const icons = [...byKey.values()].map(({ r, ...rest }) => { void r; return rest; });
  return NextResponse.json({ ok: true, icons });
}
