"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProductTranslationEditor } from "@/components/translations/product-translation-editor";
import { SUPPORTED_LOCALES } from "@/lib/datasheet/locales";
import type { ProductWithSpecs, Version, ProductTranslation } from "@/types/database";

interface ProductDetailProps {
  product: ProductWithSpecs;
  versions: Version[];
  translations?: ProductTranslation[];
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ImageUploadButton({
  modelName,
  imageType,
  currentUrl,
  onUploaded,
}: {
  modelName: string;
  imageType: "product" | "hardware";
  currentUrl: string;
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("model", modelName);
      formData.append("type", imageType);

      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.ok) {
        onUploaded();
      } else {
        alert(`Upload failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      alert(
        `Upload failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  const label = imageType === "product" ? "Product Image" : "Hardware Image";
  const hasImage = currentUrl && !currentUrl.startsWith("cache/");

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors hover:border-engenius-blue/30">
      {hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={currentUrl}
          alt={`${modelName} ${imageType}`}
          className="h-32 w-auto object-contain"
        />
      ) : (
        <div className="flex h-32 w-32 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
          No image
        </div>
      )}
      <span className="text-sm font-medium">{label}</span>
      <label>
        <span className="inline-flex h-8 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-xs hover:bg-accent hover:text-accent-foreground transition-colors">
          {uploading ? "Uploading..." : hasImage ? "Replace" : "Upload"}
        </span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />
      </label>
    </div>
  );
}

function RadioPatternSlot({
  modelName,
  band,
  plane,
  label,
  hasImage,
  imageUrl,
  onUploaded,
}: {
  modelName: string;
  band: string;
  plane: string;
  label: string;
  hasImage: boolean;
  imageUrl?: string;
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("model", modelName);
      formData.append("type", "radio_pattern");
      formData.append("label", label);
      const res = await fetch("/api/upload-image", { method: "POST", body: formData });
      const data = await res.json();
      if (data.ok) {
        onUploaded();
      } else {
        alert(`Upload failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      alert(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div
      className={`flex w-36 flex-col items-center gap-2 rounded-lg border-2 border-dashed p-3 transition-colors ${
        hasImage
          ? "border-green-300 bg-green-50"
          : "border-gray-200 bg-gray-50 hover:border-engenius-blue/30"
      }`}
    >
      {hasImage && imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={`${modelName} ${label}`} className="h-16 w-auto object-contain" />
      ) : (
        <svg className="h-10 w-10 text-gray-300" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
        </svg>
      )}
      <span className={`text-xs font-medium ${hasImage ? "text-green-700" : "text-gray-400"}`}>
        {band} {plane}
      </span>
      <label>
        <span className="inline-flex h-6 cursor-pointer items-center rounded border border-input bg-background px-2 text-[10px] font-medium shadow-xs hover:bg-accent transition-colors">
          {uploading ? "..." : hasImage ? "Replace" : "Upload"}
        </span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleUpload}
          disabled={uploading}
        />
      </label>
    </div>
  );
}

export function ProductDetail({ product, versions, translations = [] }: ProductDetailProps) {
  const [activeTab, setActiveTab] = useState<"detail" | "translations">("detail");
  const router = useRouter();
  const [generating, setGenerating] = useState(false);

  const [showGenMenu, setShowGenMenu] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  const currentVer = product.current_version || "0.0";
  const hasExistingVersion = currentVer !== "0.0";

  const isAP = product.product_line.category === "APs";

  // Determine which radio pattern slots to show for AP products
  // Check "Operating Frequency" spec for 6GHz support
  const has6G = isAP && product.spec_sections.some((s) =>
    s.items.some(
      (i) =>
        i.label.toLowerCase().includes("operating frequency") &&
        /6\s*GHz/i.test(i.value)
    )
  );
  const radioPatternSlots = isAP
    ? [
        { band: "2.4G", plane: "H-plane" },
        { band: "2.4G", plane: "E-plane" },
        { band: "5G", plane: "H-plane" },
        { band: "5G", plane: "E-plane" },
        ...(has6G
          ? [
              { band: "6G", plane: "H-plane" },
              { band: "6G", plane: "E-plane" },
            ]
          : []),
      ]
    : [];

  const hasProductImage = !!product.product_image && !product.product_image.startsWith("cache/");
  const hasHardwareImage = !!product.hardware_image && !product.hardware_image.startsWith("cache/");
  const hasOverview = !!product.overview && product.overview.trim().length > 0;
  const hasFeatures = Array.isArray(product.features) && product.features.length > 0;
  const canGenerate = hasProductImage && hasHardwareImage && hasOverview && hasFeatures;

  const missingItems: string[] = [];
  if (!hasProductImage) missingItems.push("Product Image");
  if (!hasHardwareImage) missingItems.push("Hardware Image");
  if (!hasOverview) missingItems.push("Overview");
  if (!hasFeatures) missingItems.push("Features");

  const currentVersions = (product.current_versions ?? {}) as Record<string, string>;
  const localesWithTranslations = translations.map((t) => t.locale);
  const confirmedLocales = new Set(translations.filter((t) => t.confirmed).map((t) => t.locale));

  async function handleGeneratePdf(mode: "regenerate" | "new", locale = "en") {
    setShowGenMenu(false);
    setShowLangMenu(false);
    setGenerating(true);
    try {
      const res = await fetch(
        `/api/generate-pdf?model=${encodeURIComponent(product.model_name)}&mode=${mode}&lang=${locale}`,
        { method: "POST" }
      );
      const data = await res.json();
      if (data.ok && data.pdfUrl) {
        window.open(data.pdfUrl, "_blank");
        router.refresh();
      } else {
        alert(`PDF generation failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      alert(
        `PDF generation failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm">
        <Link
          href={`/dashboard/cloud?line=${product.product_line.name.toLowerCase().replace(/\s+/g, "-")}`}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {product.product_line.label}
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="font-medium text-foreground">
          {product.model_name}
        </span>
      </nav>

      {/* Sticky Header */}
      <div className="sticky top-14 z-20 -mx-6 bg-background/95 backdrop-blur-sm border-b border-transparent [&.is-stuck]:border-border px-6 py-3">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">
              {product.model_name}
            </h1>
            {hasExistingVersion ? (
              <span className="rounded-md bg-engenius-blue/10 px-2.5 py-1 text-sm font-semibold tabular-nums text-engenius-blue">
                v{currentVer}
              </span>
            ) : (
              <span className="rounded-md bg-muted px-2.5 py-1 text-sm font-medium text-muted-foreground">
                No version
              </span>
            )}
            <span className="hidden sm:inline text-sm text-muted-foreground/60 truncate">
              {product.full_name}
            </span>
          </div>
        <div className="flex flex-shrink-0 gap-3">
          <Link href={`/preview/${product.model_name}`} target="_blank">
            <Button variant="outline" size="default">
              Preview Datasheet
            </Button>
          </Link>
          <div className="relative">
            {!canGenerate && (
              <p className="absolute -top-6 right-0 text-[11px] text-red-500 whitespace-nowrap">
                Missing: {missingItems.join(", ")}
              </p>
            )}
            <div className="flex">
              <Button
                size="default"
                className={hasExistingVersion ? "rounded-r-none" : ""}
                onClick={() =>
                  handleGeneratePdf(hasExistingVersion ? "regenerate" : "new")
                }
                disabled={generating || !canGenerate}
              >
                {generating
                  ? "Generating..."
                  : hasExistingVersion
                    ? `Regenerate v${currentVer}`
                    : "Generate PDF"}
              </Button>
              {hasExistingVersion && (
                <Button
                  size="default"
                  className="rounded-l-none border-l border-white/20 px-2.5"
                  onClick={() => setShowGenMenu(!showGenMenu)}
                  disabled={generating || !canGenerate}
                >
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 5l3 3 3-3" />
                  </svg>
                </Button>
              )}
            </div>
            {showGenMenu && (
              <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-md border bg-popover p-1 shadow-md">
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent transition-colors"
                  onClick={() => handleGeneratePdf("regenerate")}
                >
                  <svg
                    className="h-4 w-4 text-muted-foreground"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M1 8a7 7 0 0 1 13.1-3.5M15 8a7 7 0 0 1-13.1 3.5" />
                    <path d="M14 1v4h-4M2 15v-4h4" />
                  </svg>
                  <div className="text-left">
                    <div className="font-medium">
                      Regenerate v{currentVer}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      覆蓋當前版本的 PDF
                    </div>
                  </div>
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent transition-colors"
                  onClick={() => handleGeneratePdf("new")}
                >
                  <svg
                    className="h-4 w-4 text-muted-foreground"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M8 3v10M3 8h10" />
                  </svg>
                  <div className="text-left">
                    <div className="font-medium">New Version</div>
                    <div className="text-xs text-muted-foreground">
                      建立新版本 PDF
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* 🌐 Other Languages button (方案 C) */}
          {localesWithTranslations.length > 0 && (
            <div className="relative">
              <Button
                variant="outline"
                size="default"
                onClick={() => setShowLangMenu(!showLangMenu)}
                disabled={generating}
                className="px-2.5"
                title="Other Languages"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" />
                </svg>
              </Button>
              {showLangMenu && (
                <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-md border bg-popover p-2 shadow-md">
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Other Languages</div>
                  {SUPPORTED_LOCALES.filter((l) => l.value !== "en").map((l) => {
                    const hasTranslation = localesWithTranslations.includes(l.value);
                    const localeVer = currentVersions[l.value];
                    return (
                      <div key={l.value} className="rounded-sm px-2 py-2">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium">
                            {l.flag} {l.label}
                            {localeVer && (
                              <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">v{localeVer}</span>
                            )}
                          </span>
                        </div>
                        {hasTranslation ? (
                          <div className="flex flex-col gap-1.5">
                            {confirmedLocales.has(l.value) ? (
                              <div className="flex gap-1.5">
                                {localeVer ? (
                                  <>
                                    <button
                                      className="rounded px-2 py-1 text-xs font-medium text-engenius-blue hover:bg-engenius-blue/10 transition-colors"
                                      onClick={() => handleGeneratePdf("regenerate", l.value)}
                                    >
                                      Regen v{localeVer}
                                    </button>
                                    <button
                                      className="rounded px-2 py-1 text-xs font-medium text-engenius-blue hover:bg-engenius-blue/10 transition-colors"
                                      onClick={() => handleGeneratePdf("new", l.value)}
                                    >
                                      New Ver
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    className="rounded px-2 py-1 text-xs font-medium text-engenius-blue hover:bg-engenius-blue/10 transition-colors"
                                    onClick={() => handleGeneratePdf("new", l.value)}
                                  >
                                    Generate v1.0
                                  </button>
                                )}
                                <Link
                                  href={`/preview/${product.model_name}?lang=${l.value}&mode=full`}
                                  target="_blank"
                                  className="rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                                >
                                  Preview
                                </Link>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Draft</span>
                                <span className="text-xs text-muted-foreground/60">Save translation to enable PDF generation</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground/60">No translation yet</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Sub-header info */}
      <p className="-mt-4 text-xs text-muted-foreground">
        Last edited{" "}
        {formatDate(product.sheet_last_modified ?? product.updated_at)}
        {product.sheet_last_editor && ` by ${product.sheet_last_editor}`}
      </p>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        <button
          onClick={() => setActiveTab("detail")}
          className={`cursor-pointer rounded-md px-4 py-1.5 text-xs font-medium transition-all ${
            activeTab === "detail"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Detail
        </button>
        <button
          onClick={() => setActiveTab("translations")}
          className={`cursor-pointer rounded-md px-4 py-1.5 text-xs font-medium transition-all ${
            activeTab === "translations"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Translations
          {translations.length > 0 && (
            <span className="ml-1.5 tabular-nums text-muted-foreground/50">{translations.length}</span>
          )}
        </button>
      </div>

      <Separator />

      {/* Translations tab */}
      {activeTab === "translations" && (
        <ProductTranslationEditor
          modelName={product.model_name}
          productLineName={product.product_line.name}
          englishOverview={product.overview ?? ""}
          englishFeatures={product.features ?? []}
          englishHeadline={product.headline || product.full_name}
          existingTranslations={translations.map((t) => ({
            locale: t.locale,
            translation_mode: t.translation_mode,
            overview: t.overview,
            features: t.features,
            headline: t.headline,
            qr_label: t.qr_label,
            qr_url: t.qr_url,
            confirmed: t.confirmed,
          }))}
        />
      )}

      {/* Product Images */}
      {activeTab === "detail" && (<>
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Product Images</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <ImageUploadButton
              modelName={product.model_name}
              imageType="product"
              currentUrl={product.product_image}
              onUploaded={() => router.refresh()}
            />
            <ImageUploadButton
              modelName={product.model_name}
              imageType="hardware"
              currentUrl={product.hardware_image}
              onUploaded={() => router.refresh()}
            />
          </div>

          {/* Radio Pattern placeholders (AP only) */}
          {isAP && (
            <div className="mt-6">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Radio Patterns
              </h4>
              <div className="flex flex-wrap gap-4">
                {radioPatternSlots.map((slot) => {
                  const slotLabel = `${slot.band} ${slot.plane}`;
                  const asset = product.image_assets.find(
                    (a) =>
                      a.image_type === "radio_pattern" &&
                      a.label === slotLabel
                  );
                  const hasImage = asset && asset.status !== "missing" && asset.file_url;
                  return (
                    <RadioPatternSlot
                      key={`${slot.band}-${slot.plane}`}
                      modelName={product.model_name}
                      band={slot.band}
                      plane={slot.plane}
                      label={slotLabel}
                      hasImage={!!hasImage}
                      imageUrl={hasImage ? asset!.file_url! : undefined}
                      onUploaded={() => router.refresh()}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            Images are automatically synced from Google Drive. You can also
            upload manually here.
          </p>
        </CardContent>
      </Card>

      {/* Overview & Features */}
      {(product.overview || product.features?.length > 0) && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Overview & Features</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Overview */}
            {product.overview && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Overview
                </h3>
                <p className="text-sm leading-relaxed text-foreground/85">
                  {product.overview}
                </p>
              </div>
            )}

            {/* Features */}
            {product.features?.length > 0 && (
              <div>
                {product.overview && <Separator className="mb-5" />}
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Key Features
                </h3>
                <ul className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
                  {product.features.map((feature, i) => (
                    <li key={i} className="flex items-baseline gap-2 text-sm">
                      <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-engenius-blue/60" />
                      <span className="text-foreground/85">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Specifications */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Specifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {product.spec_sections.map((section) => (
            <div
              key={section.id}
              className="overflow-hidden rounded-lg border"
            >
              {/* Category header */}
              <div className="border-b bg-engenius-blue/[0.06] px-4 py-2">
                <h3 className="text-sm font-semibold text-engenius-blue">
                  {section.category}
                </h3>
              </div>
              {/* Spec rows */}
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[220px]" />
                  <col />
                </colgroup>
                <tbody>
                  {section.items.map((item, idx) => (
                    <tr
                      key={item.id}
                      className={`border-b border-border/50 last:border-b-0 ${
                        idx % 2 === 1 ? "bg-muted/30" : ""
                      }`}
                    >
                      <td className="py-2 px-4 align-top text-sm font-medium text-muted-foreground">
                        {item.label}
                      </td>
                      <td className="py-2 px-4 align-top text-sm leading-relaxed break-words">
                        {item.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {product.spec_sections.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No specifications loaded yet. Run a sync to pull data from Google
              Sheets.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Version History — grouped by locale */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Version History</CardTitle>
        </CardHeader>
        <CardContent>
          {versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No versions generated yet.
            </p>
          ) : (
            <div className="space-y-6">
              {/* Group versions by locale */}
              {Object.entries(
                versions.reduce<Record<string, typeof versions>>((acc, v) => {
                  const loc = v.locale || "en";
                  if (!acc[loc]) acc[loc] = [];
                  acc[loc].push(v);
                  return acc;
                }, {})
              )
                .sort(([a], [b]) => (a === "en" ? -1 : b === "en" ? 1 : a.localeCompare(b)))
                .map(([loc, locVersions]) => {
                  const localeInfo = SUPPORTED_LOCALES.find((l) => l.value === loc);
                  return (
                    <div key={loc}>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {localeInfo ? `${localeInfo.flag} ${localeInfo.label}` : loc.toUpperCase()}
                      </h4>
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b-2 border-foreground/10">
                            <TableHead className="w-24">Version</TableHead>
                            <TableHead className="w-32">Date</TableHead>
                            <TableHead>Changes</TableHead>
                            <TableHead className="w-24">PDF</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {locVersions.map((v, idx) => (
                            <TableRow
                              key={v.id}
                              className={`hover:bg-engenius-blue/[0.06] ${
                                idx % 2 === 1 ? "bg-muted/30" : ""
                              }`}
                            >
                              <TableCell className="font-medium tabular-nums">
                                v{v.version}
                              </TableCell>
                              <TableCell className="text-sm tabular-nums text-muted-foreground">
                                {formatDate(v.generated_at)}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {v.changes || "—"}
                              </TableCell>
                              <TableCell>
                                {v.pdf_storage_path ? (
                                  <a
                                    href={v.pdf_storage_path}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-0.5 rounded px-2 py-0.5 text-xs font-medium text-engenius-blue hover:bg-engenius-blue/10 transition-colors"
                                  >
                                    Download
                                    <svg
                                      className="h-3 w-3"
                                      viewBox="0 0 16 16"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    >
                                      <path d="M5 3h8v8M13 3 6 10" />
                                    </svg>
                                  </a>
                                ) : (
                                  <span className="text-sm text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>
      </>)}
    </div>
  );
}
