import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectLatestVersion } from "@/lib/google/drive-versions";
import { gate } from "@/lib/auth/session";

/**
 * POST /api/resync-versions?line=Cloud%20VPN%20Firewall
 *
 * Scans Google Drive for the latest PDF version of every product in the
 * given product line, updates `products.current_version` and
 * `products.current_versions.en` to match Drive.
 *
 * Why this exists: daily sync only pulls Sheet content + images, never
 * probes Drive for version changes. If a PM manually drops a new PDF in
 * Drive (or `/api/generate-pdf` partially succeeded), the DB shows stale
 * version numbers on the Dashboard. This endpoint lets MKT bring the DB
 * back in line on demand.
 *
 * Currently English-only. Future: extend to per-locale versions.
 */
export const maxDuration = 60;

interface ProductRow {
  id: string;
  model_name: string;
  current_version: string | null;
  current_versions: Record<string, string> | null;
}

interface ProductLineRow {
  id: string;
  name: string;
  ds_prefix: string | null;
  drive_folder_id: string | null;
}

export async function POST(request: Request) {
  const denied = await gate("sync.run");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const lineName = searchParams.get("line");
  if (!lineName) {
    return NextResponse.json({ error: "Missing ?line=" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: line, error: lineErr } = (await supabase
    .from("product_lines")
    .select("id, name, ds_prefix, drive_folder_id")
    .eq("name", lineName)
    .maybeSingle()) as { data: ProductLineRow | null; error: unknown };

  if (lineErr) {
    return NextResponse.json(
      { error: "DB error", details: String(lineErr) },
      { status: 500 },
    );
  }
  if (!line) {
    return NextResponse.json(
      { error: `Product line "${lineName}" not found` },
      { status: 404 },
    );
  }
  if (!line.drive_folder_id) {
    return NextResponse.json(
      { error: `Product line "${lineName}" has no Drive folder configured` },
      { status: 400 },
    );
  }

  const dsPrefix = line.ds_prefix ?? "DS_Cloud";

  const { data: products, error: productsErr } = (await supabase
    .from("products")
    .select("id, model_name, current_version, current_versions")
    .eq("product_line_id", line.id)
    .order("model_name")) as { data: ProductRow[] | null; error: unknown };

  if (productsErr) {
    return NextResponse.json(
      { error: "DB error", details: String(productsErr) },
      { status: 500 },
    );
  }

  const all = products ?? [];

  const changes: Array<{ model: string; from: string; to: string }> = [];
  const unchanged: string[] = [];
  const notFound: string[] = [];
  const errors: Array<{ model: string; error: string }> = [];

  for (const p of all) {
    try {
      const detected = await detectLatestVersion(
        line.drive_folder_id,
        dsPrefix,
        p.model_name,
      );
      if (!detected) {
        notFound.push(p.model_name);
        continue;
      }
      const driveVer = detected.version;
      const dbVer = (p.current_versions?.en) || p.current_version || "0.0";
      if (driveVer === dbVer) {
        unchanged.push(p.model_name);
        continue;
      }
      const mergedVersions = {
        ...(p.current_versions ?? {}),
        en: driveVer,
      };
      const { error: updErr } = await supabase
        .from("products")
        .update({
          current_version: driveVer,
          current_versions: mergedVersions,
        })
        .eq("id", p.id);
      if (updErr) {
        errors.push({ model: p.model_name, error: String(updErr) });
        continue;
      }
      changes.push({ model: p.model_name, from: dbVer, to: driveVer });
    } catch (err) {
      errors.push({
        model: p.model_name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    line: line.name,
    scanned: all.length,
    changes,
    unchanged_count: unchanged.length,
    not_found_in_drive: notFound,
    errors,
  });
}
