import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const models = [
    "ECW201L-AC", "ECS1528P", "ECS1552P", "ECS2528FP",
    "ECS8854F", "ECS8830F", "ESG320", "ESG610",
    "ECW516L", "ECW536S", "ECW536",
  ];

  const { data } = await supabase
    .from("products")
    .select("model_name, overview, features, product_image, hardware_image, current_version")
    .in("model_name", models);

  console.log("Model          Ver     OV   Feats  ProdImg  HWImg  → preview status");
  for (const p of (data ?? []) as Array<{
    model_name: string;
    overview: string | null;
    features: string[] | null;
    product_image: string | null;
    hardware_image: string | null;
    current_version: string | null;
  }>) {
    const has = (v: string | null | undefined) =>
      !!v && !String(v).startsWith("cache/");
    const ov = has(p.overview) ? "✅" : "❌";
    const ft = (p.features?.length ?? 0) > 0 ? "✅" : "❌";
    const pi = has(p.product_image) ? "✅" : "❌";
    const hi = has(p.hardware_image) ? "✅" : "❌";
    const complete = has(p.overview) && (p.features?.length ?? 0) > 0 && has(p.product_image) && has(p.hardware_image);
    const status = complete ? "🟢 ready" : "🔴 missing data";
    console.log(
      `${p.model_name.padEnd(14)} ${String(p.current_version ?? "-").padEnd(6)}  ${ov}   ${ft}     ${pi}        ${hi}      ${status}`,
    );
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
