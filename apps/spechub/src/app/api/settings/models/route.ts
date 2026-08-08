import { NextResponse } from "next/server";
import { listModels, SUPPORTED_SURFACES } from "@eg/llm/models";
import { getCurrentUser } from "@eg/auth/session";

/**
 * Models offered on a surface — read-only, for the translation picker.
 *
 * Managing the catalog lives in EnGenie (/settings/models) alongside the
 * API keys and spend pages. This endpoint exists so SpecHub's picker
 * reads the shared database directly rather than calling across apps.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const surface = new URL(request.url).searchParams.get("surface") ?? "translate";
  if (!SUPPORTED_SURFACES.includes(surface as (typeof SUPPORTED_SURFACES)[number])) {
    return NextResponse.json({ error: `Unknown surface: ${surface}` }, { status: 400 });
  }

  const models = await listModels(surface as "translate");
  return NextResponse.json({ ok: true, models });
}
