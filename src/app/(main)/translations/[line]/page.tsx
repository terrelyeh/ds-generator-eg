import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePagePermission } from "@/lib/auth/page-guards";
import { SpecLabelTranslationsEditor } from "@/components/translations/spec-label-editor";
import type { ProductLine } from "@/types/database";

interface SpecLabelRow {
  original_label: string;
  translated_label: string | null;
  label_type: "spec" | "section";
}

export default async function TranslationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ line: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  await requirePagePermission("translation.edit");
  const { line } = await params;
  const { locale = "ja" } = await searchParams;
  const decodedLine = decodeURIComponent(line);
  const supabase = await createClient();

  const { data: productLine } = (await supabase
    .from("product_lines")
    .select("*")
    .eq("name", decodedLine)
    .single()) as { data: ProductLine | null };

  if (!productLine) notFound();

  // Get all unique spec section categories + spec item labels from products in this line
  const { data: products } = (await supabase
    .from("products")
    .select("id, model_name, status")
    .eq("product_line_id", productLine.id)
    .order("model_name")) as { data: { id: string; model_name: string; status: string }[] | null };

  const productIds = (products ?? []).map((p) => p.id);
  // Pick a sample model for the "Preview in context" link — prefer an
  // Active model (PMs usually want to see it render on something real)
  // and fall back to any if no active exists.
  const sampleModel =
    (products ?? []).find((p) => p.status === "active")?.model_name ??
    (products ?? [])[0]?.model_name ??
    null;

  // Get all spec sections for this product line
  const { data: sections } = productIds.length
    ? await supabase
        .from("spec_sections")
        .select("category, spec_items (label)")
        .in("product_id", productIds)
    : { data: null };

  // Build unique section names and spec labels
  const sectionNames = new Set<string>();
  const specLabels = new Set<string>();
  const sectionLabelsMap: Record<string, string[]> = {};

  for (const section of (sections ?? []) as { category: string; spec_items: { label: string }[] }[]) {
    sectionNames.add(section.category);
    if (!sectionLabelsMap[section.category]) {
      sectionLabelsMap[section.category] = [];
    }
    for (const item of section.spec_items ?? []) {
      if (!specLabels.has(item.label)) {
        specLabels.add(item.label);
        sectionLabelsMap[section.category].push(item.label);
      }
    }
  }

  // Deduplicate labels within each section
  for (const key of Object.keys(sectionLabelsMap)) {
    sectionLabelsMap[key] = [...new Set(sectionLabelsMap[key])];
  }

  // Get existing translations for this locale
  const { data: existingTranslations } = (await supabase
    .from("spec_label_translations")
    .select("original_label, translated_label, label_type")
    .eq("product_line_id", productLine.id)
    .eq("locale", locale)) as { data: SpecLabelRow[] | null };

  const translationMap: Record<string, string> = {};
  for (const t of existingTranslations ?? []) {
    if (t.translated_label) {
      const key = `${t.label_type}:${t.original_label}`;
      translationMap[key] = t.translated_label;
    }
  }

  // Count progress
  const totalLabels = sectionNames.size + specLabels.size;
  const filledLabels = Object.keys(translationMap).length;

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm">
        <Link
          href={`/dashboard/cloud?line=${productLine.name.toLowerCase().replace(/\s+/g, "-")}`}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {productLine.label}
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="font-medium text-foreground">Spec Label Translations</span>
      </nav>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          {productLine.label} — Spec Label Translations
        </h1>
        <div className="text-sm text-muted-foreground tabular-nums">
          {filledLabels}/{totalLabels} translated
        </div>
      </div>

      <SpecLabelTranslationsEditor
        productLineId={productLine.id}
        productLineLabel={productLine.label}
        locale={locale}
        sectionNames={[...sectionNames]}
        sectionLabelsMap={sectionLabelsMap}
        initialTranslations={translationMap}
        sampleModel={sampleModel}
      />
    </div>
  );
}
