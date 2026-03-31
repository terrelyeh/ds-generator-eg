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
      alert(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  const label = imageType === "product" ? "Product Image" : "Hardware Image";
  const hasImage = currentUrl && !currentUrl.startsWith("cache/");

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border p-4">
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
        <span className="inline-flex h-8 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-xs hover:bg-accent hover:text-accent-foreground">
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

  async function handleGeneratePdf() {
    setGenerating(true);
    try {
      const res = await fetch(
        `/api/generate-pdf?model=${encodeURIComponent(product.model_name)}`,
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
      alert(`PDF generation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{product.model_name}</h1>
            <Badge variant="outline">v{product.current_version}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {product.full_name}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {product.product_line.label} · Last edited{" "}
            {formatDate(product.sheet_last_modified ?? product.updated_at)}
            {product.sheet_last_editor && ` by ${product.sheet_last_editor}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/preview/${product.model_name}`} target="_blank">
            <Button variant="outline">Preview Datasheet</Button>
          </Link>
          <Button onClick={handleGeneratePdf} disabled={generating}>
            {generating ? "Generating..." : "Generate PDF"}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Product Images */}
      <Card>
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

      {/* Specs Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Specifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {product.spec_sections.map((section) => (
            <div key={section.id}>
              <h3 className="mb-2 text-sm font-medium text-engenius-blue">
                {section.category}
              </h3>
              <Table>
                <TableBody>
                  {section.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="w-1/3 text-sm font-medium text-muted-foreground">
                        {item.label}
                      </TableCell>
                      <TableCell className="text-sm">{item.value}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
      <Card>
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
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Changes</TableHead>
                  <TableHead>PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium tabular-nums">
                      v{v.version}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
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
                          className="text-sm text-engenius-blue hover:underline"
                        >
                          Download
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
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
