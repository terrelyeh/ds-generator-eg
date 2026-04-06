"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ProductLine } from "@/types/database";

interface ProductSummary {
  id: string;
  model_name: string;
  subtitle: string;
  full_name: string;
  current_version: string;
  has_product_image: boolean;
  has_hardware_image: boolean;
  radio_patterns: { band: string; h_plane: boolean; e_plane: boolean }[];
  sheet_last_modified: string | null;
  sheet_last_editor: string | null;
  updated_at: string;
  product_line_id: string;
  product_line: { name: string; label: string; category: string };
}

interface DashboardContentProps {
  productLines: ProductLine[];
  products: ProductSummary[];
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Compact check/cross indicator */
function ImgStatus({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="text-green-600 text-sm font-medium" title="Ready">
      ✓
    </span>
  ) : (
    <span className="text-muted-foreground/40 text-sm" title="Missing">
      ✗
    </span>
  );
}

/** Radio pattern cell for AP — shows bands with H/E status */
function RadioPatternCell({
  patterns,
}: {
  patterns: { band: string; h_plane: boolean; e_plane: boolean }[];
}) {
  if (patterns.length === 0) {
    return <span className="text-xs text-muted-foreground/40">—</span>;
  }
  return (
    <div className="flex gap-2">
      {patterns.map((p) => {
        const complete = p.h_plane && p.e_plane;
        const partial = p.h_plane || p.e_plane;
        return (
          <Badge
            key={p.band}
            variant="outline"
            className={`text-[10px] px-1.5 py-0 ${
              complete
                ? "border-green-300 text-green-700 bg-green-50"
                : partial
                  ? "border-amber-300 text-amber-700 bg-amber-50"
                  : "text-muted-foreground"
            }`}
            title={`${p.band}: H-plane ${p.h_plane ? "✓" : "✗"} / E-plane ${p.e_plane ? "✓" : "✗"}`}
          >
            {p.band}
          </Badge>
        );
      })}
    </div>
  );
}

function ProductTable({
  products,
  lineCategory,
}: {
  products: ProductSummary[];
  lineCategory: string;
}) {
  if (products.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No products found in this product line.
      </div>
    );
  }

  const isAP = lineCategory.toLowerCase().includes("ap");

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b-2 border-border">
          <TableHead className="w-[40px] text-center">#</TableHead>
          <TableHead className="w-[120px]">Model #</TableHead>
          <TableHead>Model Name</TableHead>
          <TableHead className="w-[72px] text-center">Version</TableHead>
          <TableHead className="w-[120px]">Last Edited</TableHead>
          <TableHead className="w-[110px]">Edited By</TableHead>
          <TableHead className="w-[68px] text-center">Product</TableHead>
          <TableHead className="w-[72px] text-center">Hardware</TableHead>
          {isAP && (
            <TableHead className="w-[120px] text-center">
              Radio Pattern
            </TableHead>
          )}
          <TableHead className="w-[72px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product, index) => (
          <TableRow
            key={product.id}
            className={index % 2 === 1 ? "bg-muted/30" : ""}
          >
            <TableCell className="text-center text-xs tabular-nums text-muted-foreground">
              {index + 1}
            </TableCell>
            <TableCell>
              <Link
                href={`/product/${product.model_name}`}
                className="font-medium text-engenius-blue hover:underline"
              >
                {product.model_name}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {product.subtitle || product.full_name}
            </TableCell>
            <TableCell className="text-center">
              <Badge variant="outline" className="tabular-nums">
                v{product.current_version}
              </Badge>
            </TableCell>
            <TableCell className="tabular-nums">
              {formatDate(
                product.sheet_last_modified ?? product.updated_at
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {product.sheet_last_editor ?? "—"}
            </TableCell>
            <TableCell className="text-center">
              <ImgStatus ok={product.has_product_image} />
            </TableCell>
            <TableCell className="text-center">
              <ImgStatus ok={product.has_hardware_image} />
            </TableCell>
            {isAP && (
              <TableCell className="text-center">
                <RadioPatternCell patterns={product.radio_patterns} />
              </TableCell>
            )}
            <TableCell>
              <Link
                href={`/preview/${product.model_name}`}
                target="_blank"
                className="text-xs text-engenius-blue hover:underline"
              >
                Preview
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function DashboardContent({
  productLines,
  products,
}: DashboardContentProps) {
  const firstLineWithProducts = productLines.find((pl) =>
    products.some((p) => p.product_line_id === pl.id)
  );
  const [activeTab, setActiveTab] = useState(
    firstLineWithProducts?.id ?? productLines[0]?.id ?? ""
  );

  const activeLine = productLines.find((pl) => pl.id === activeTab);
  const filteredProducts = products.filter(
    (p) => p.product_line_id === activeTab
  );

  return (
    <div className="space-y-4">
      {/* Tabs + nav actions */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {productLines.map((pl) => {
            const count = products.filter(
              (p) => p.product_line_id === pl.id
            ).length;
            if (count === 0) return null;
            return (
              <button
                key={pl.id}
                onClick={() => setActiveTab(pl.id)}
                className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === pl.id
                    ? "bg-engenius-blue text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background"
                }`}
              >
                {pl.label} ({count})
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Link
            href={`/compare/${encodeURIComponent(activeLine?.name ?? "")}`}
            className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Compare
          </Link>
          <Link
            href={`/changelog/${encodeURIComponent(activeLine?.name ?? "")}`}
            className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Change Log
          </Link>
        </div>
      </div>

      {/* Product table */}
      <div className="rounded-lg border bg-card">
        <ProductTable
          products={filteredProducts}
          lineCategory={activeLine?.category ?? ""}
        />
      </div>
    </div>
  );
}
