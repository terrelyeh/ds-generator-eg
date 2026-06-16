import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@eg/db/server";
import { requirePagePermission } from "@eg/auth/page-guards";
import { can } from "@eg/auth/permissions";
import { BattlecardView } from "@/components/battlecard/battlecard-view";
import type {
  ProductLine,
  BattlecardDimension,
  BattlecardValue,
} from "@eg/db/types";

// One column in a battlecard group: either our anchor model or a competitor.
export interface BattlecardColumn {
  key: string; // anchor model_name, or competitor_product_id
  label: string;
  owner: "engenius" | "competitor";
  brand?: string;
  tier?: number;
}

export interface BattlecardCell {
  valueId: string | null;
  value: string;
  confirmed: boolean;
  sourceUrl: string | null;
  capturedAt: string | null;
}

export interface BattlecardRow {
  dimensionId: string;
  dimensionKey: string;
  category: string;
  label: string;
  unit: string | null;
  cells: Record<string, BattlecardCell>; // keyed by column.key
}

export interface BattlecardGroup {
  anchorModel: string;
  anchorName: string | null;
  columns: BattlecardColumn[];
  rows: BattlecardRow[];
  confirmedCount: number;
  competitorCellCount: number;
}

interface MatchupRow {
  anchor_model_name: string;
  tier: number;
  sort_order: number;
  competitor_products: {
    id: string;
    model_name: string;
    display_name: string | null;
    competitors: { name: string; brand_family: string | null } | null;
  } | null;
}

export default async function BattlecardPage({
  params,
}: {
  params: Promise<{ line: string }>;
}) {
  const user = await requirePagePermission("battlecard.view");
  const { line } = await params;
  const decodedLine = decodeURIComponent(line);
  const supabase = await createClient();

  const { data: productLine } = (await supabase
    .from("product_lines")
    .select("*")
    .eq("name", decodedLine)
    .single()) as { data: ProductLine | null };

  if (!productLine) notFound();

  // Dimensions (rows), matchups (who-vs-who + tier), and the line's products
  // (anchor picker for the manage panel).
  const [{ data: dimData }, { data: matchupData }, { data: lineProductData }] =
    await Promise.all([
      supabase
        .from("battlecard_dimensions")
        .select("*")
        .eq("product_line_id", productLine.id)
        .order("sort_order") as unknown as Promise<{ data: BattlecardDimension[] | null }>,
      supabase
        .from("competitor_matchups")
        .select(
          "anchor_model_name, tier, sort_order, competitor_products(id, model_name, display_name, competitors(name, brand_family))"
        )
        .eq("product_line_id", productLine.id)
        .eq("enabled", true)
        .order("sort_order") as unknown as Promise<{ data: MatchupRow[] | null }>,
      supabase
        .from("products")
        .select("model_name, full_name")
        .eq("product_line_id", productLine.id)
        .order("model_name") as unknown as Promise<{ data: { model_name: string; full_name: string }[] | null }>,
    ]);

  const dimensions = dimData ?? [];
  const matchups = matchupData ?? [];
  const lineProducts = lineProductData ?? [];
  const dimIds = dimensions.map((d) => d.id);

  const { data: valueData } = (dimIds.length
    ? await supabase.from("battlecard_values").select("*").in("dimension_id", dimIds)
    : { data: [] }) as { data: BattlecardValue[] | null };
  const values = valueData ?? [];

  // Index values for O(1) lookup: by anchor (dim|model) and competitor (dim|cpId).
  const anchorVal = new Map<string, BattlecardValue>();
  const compVal = new Map<string, BattlecardValue>();
  for (const v of values) {
    if (v.anchor_model_name) anchorVal.set(`${v.dimension_id}|${v.anchor_model_name}`, v);
    else if (v.competitor_product_id) compVal.set(`${v.dimension_id}|${v.competitor_product_id}`, v);
  }

  // Anchor models in matchup order (first appearance wins).
  const anchorOrder: string[] = [];
  for (const m of matchups) {
    if (!anchorOrder.includes(m.anchor_model_name)) anchorOrder.push(m.anchor_model_name);
  }

  // Anchor display names.
  const { data: anchorProducts } = (anchorOrder.length
    ? await supabase.from("products").select("model_name, full_name").in("model_name", anchorOrder)
    : { data: [] }) as { data: { model_name: string; full_name: string }[] | null };
  const anchorNameMap = new Map((anchorProducts ?? []).map((p) => [p.model_name, p.full_name]));

  const emptyCell = (): BattlecardCell => ({
    valueId: null,
    value: "",
    confirmed: false,
    sourceUrl: null,
    capturedAt: null,
  });

  const groups: BattlecardGroup[] = anchorOrder.map((anchor) => {
    const competitors = matchups
      .filter((m) => m.anchor_model_name === anchor && m.competitor_products)
      .map((m) => {
        const cp = m.competitor_products!;
        return {
          key: cp.id,
          label: cp.display_name || cp.model_name,
          owner: "competitor" as const,
          brand: cp.competitors?.name ?? undefined,
          tier: m.tier,
        };
      });

    const columns: BattlecardColumn[] = [
      { key: anchor, label: anchor, owner: "engenius" },
      ...competitors,
    ];

    let confirmedCount = 0;
    let competitorCellCount = 0;

    const rows: BattlecardRow[] = dimensions.map((d) => {
      const cells: Record<string, BattlecardCell> = {};

      const av = anchorVal.get(`${d.id}|${anchor}`);
      cells[anchor] = av
        ? {
            valueId: av.id,
            value: av.value,
            confirmed: av.confirmed,
            sourceUrl: av.source_url,
            capturedAt: av.captured_at,
          }
        : emptyCell();

      for (const c of competitors) {
        const cv = compVal.get(`${d.id}|${c.key}`);
        cells[c.key] = cv
          ? {
              valueId: cv.id,
              value: cv.value,
              confirmed: cv.confirmed,
              sourceUrl: cv.source_url,
              capturedAt: cv.captured_at,
            }
          : emptyCell();
        // Track confirmation progress over competitor cells that have a value.
        if (cv && cv.value) {
          competitorCellCount++;
          if (cv.confirmed) confirmedCount++;
        }
      }

      return {
        dimensionId: d.id,
        dimensionKey: d.dimension_key,
        category: d.category,
        label: d.label,
        unit: d.unit,
        cells,
      };
    });

    return {
      anchorModel: anchor,
      anchorName: anchorNameMap.get(anchor) ?? null,
      columns,
      rows,
      confirmedCount,
      competitorCellCount,
    };
  });

  const canEdit = can(user.role, "battlecard.edit");

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <div className="mb-6">
        <nav className="flex items-center gap-1.5 text-sm">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
            Dashboard
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="font-medium text-foreground">Battlecard</span>
        </nav>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">
          Competitor Battlecard{" "}
          <span className="text-muted-foreground font-normal">—</span>{" "}
          <span className="text-engenius-blue">{productLine.label}</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Internal use only · competitor specs are AI-extracted drafts until a PM confirms them.
        </p>
      </div>

      {groups.length > 0 ? (
        <BattlecardView
          groups={groups}
          canEdit={canEdit}
          lineId={productLine.id}
          lineProducts={lineProducts}
        />
      ) : (
        <div className="rounded-lg border bg-card py-16 text-center text-sm text-muted-foreground shadow-sm">
          No battlecard matchups configured for this product line yet.
        </div>
      )}
    </div>
  );
}
