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
import type { ProductWithSpecs, Version } from "@/types/database";

interface ProductDetailProps {
  product: ProductWithSpecs;
  versions: Version[];
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

export function ProductDetail({ product, versions }: ProductDetailProps) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);

  const [showGenMenu, setShowGenMenu] = useState(false);

  const currentVer = product.current_version || "0.0";
  const hasExistingVersion = currentVer !== "0.0";

  async function handleGeneratePdf(mode: "regenerate" | "new") {
    setShowGenMenu(false);
    setGenerating(true);
    try {
      const res = await fetch(
        `/api/generate-pdf?model=${encodeURIComponent(product.model_name)}&mode=${mode}`,
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
          href="/dashboard"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Dashboard
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <Link
          href={`/compare/${encodeURIComponent(product.product_line.name)}`}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {product.product_line.label}
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="font-medium text-foreground">
          {product.model_name}
        </span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {product.model_name}
            </h1>
            <Badge variant="outline" className="tabular-nums">
              v{product.current_version}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {product.full_name}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Last edited{" "}
            {formatDate(product.sheet_last_modified ?? product.updated_at)}
            {product.sheet_last_editor &&
              ` by ${product.sheet_last_editor}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/preview/${product.model_name}`} target="_blank">
            <Button variant="outline" size="sm">
              Preview Datasheet
            </Button>
          </Link>
          <div className="relative">
            <div className="flex">
              <Button
                size="sm"
                className="rounded-r-none"
                onClick={() =>
                  handleGeneratePdf(hasExistingVersion ? "regenerate" : "new")
                }
                disabled={generating}
              >
                {generating
                  ? "Generating..."
                  : hasExistingVersion
                    ? `Regenerate v${currentVer}`
                    : "Generate PDF"}
              </Button>
              {hasExistingVersion && (
                <Button
                  size="sm"
                  className="rounded-l-none border-l border-white/20 px-2"
                  onClick={() => setShowGenMenu(!showGenMenu)}
                  disabled={generating}
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
        </div>
      </div>

      <Separator />

      {/* Product Images */}
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

      {/* Version History */}
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
                {versions.map((v, idx) => (
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
                        <span className="text-sm text-muted-foreground">
                          —
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
