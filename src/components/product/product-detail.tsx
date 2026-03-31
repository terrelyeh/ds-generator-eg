"use client";

import Link from "next/link";
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

export function ProductDetail({ product, versions }: ProductDetailProps) {
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
          <Button>Generate PDF</Button>
        </div>
      </div>

      <Separator />

      {/* Image Readiness */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Image Assets</CardTitle>
        </CardHeader>
        <CardContent>
          {product.image_assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No image assets tracked yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {product.image_assets.map((asset) => (
                <Badge
                  key={asset.id}
                  variant={
                    asset.status === "missing" ? "destructive" : "default"
                  }
                >
                  {asset.image_type}
                  {asset.label ? `: ${asset.label}` : ""} — {asset.status}
                </Badge>
              ))}
            </div>
          )}
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
