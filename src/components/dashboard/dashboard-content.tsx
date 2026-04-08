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
  status: string;
  has_product_image: boolean;
  has_hardware_image: boolean;
  radio_patterns: { band: string; h_plane: boolean; e_plane: boolean }[];
  last_content_changed: string | null;
  last_change_by: string | null;
  last_change_summary: string | null;
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

/** Colored dot status indicator */
function ImgStatus({ ok, label }: { ok: boolean; label: string }) {
  return ok ? (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500"
      title={`${label}: Ready`}
    />
  ) : (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full border-2 border-muted-foreground/25"
      title={`${label}: Missing`}
    />
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
      <TableHeader className="[&_th]:sticky [&_th]:top-14 [&_th]:z-10 [&_th]:bg-muted">
        <TableRow className="border-b-2 border-foreground/15">
          <TableHead className="w-10 text-center">#</TableHead>
          <TableHead className="w-36">Model #</TableHead>
          <TableHead className="w-72">Model Name</TableHead>
          <TableHead className="w-20 text-center">Version</TableHead>
          <TableHead className="w-28">Last Changed</TableHead>
          <TableHead className="w-28">Changed By</TableHead>
          <TableHead className="w-16 text-center">Product</TableHead>
          <TableHead className="w-16 text-center">Hardware</TableHead>
          {isAP && (
            <TableHead className="w-28 text-center">
              Radio Pattern
            </TableHead>
          )}
          <TableHead className="w-16">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product, index) => (
          <TableRow
            key={product.id}
            className={`hover:bg-engenius-blue/[0.06] ${
              index % 2 === 1 ? "bg-muted/30" : ""
            }`}
          >
            <TableCell className="text-center text-xs tabular-nums text-muted-foreground/60">
              {index + 1}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1.5">
                <Link
                  href={`/product/${product.model_name}`}
                  className="font-semibold text-engenius-blue hover:text-engenius-blue-dark transition-colors"
                >
                  {product.model_name}
                </Link>
                <StatusBadge status={product.status} />
              </div>
            </TableCell>
            <TableCell
              className="max-w-72 truncate text-muted-foreground"
              title={product.subtitle || product.full_name}
            >
              {product.subtitle || product.full_name}
            </TableCell>
            <TableCell className="text-center">
              <Badge variant="outline" className="tabular-nums text-xs">
                v{product.current_version}
              </Badge>
            </TableCell>
            <TableCell
              className="tabular-nums text-muted-foreground"
              title={product.last_change_summary ?? ""}
            >
              {formatDate(product.last_content_changed)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {product.last_change_by ?? "—"}
            </TableCell>
            <TableCell className="text-center">
              <ImgStatus ok={product.has_product_image} label="Product" />
            </TableCell>
            <TableCell className="text-center">
              <ImgStatus ok={product.has_hardware_image} label="Hardware" />
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
                className="inline-flex items-center gap-0.5 rounded px-2 py-0.5 text-xs font-medium text-engenius-blue hover:bg-engenius-blue/10 transition-colors"
              >
                Preview
                <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 3h8v8M13 3 6 10" />
                </svg>
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Status badge */
function StatusBadge({ status }: { status: string }) {
  if (status === "active") return null;
  const config = {
    upcoming: { label: "Upcoming", className: "border-amber-300 text-amber-700 bg-amber-50" },
    pending: { label: "Pending", className: "border-red-300 text-red-700 bg-red-50" },
  }[status] ?? { label: status, className: "border-gray-300 text-gray-600 bg-gray-50" };

  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.className}`}>
      {config.label}
    </Badge>
  );
}

export function DashboardContent({
  productLines,
  products,
}: DashboardContentProps) {
  const [showAll, setShowAll] = useState(false);

  const visibleProducts = showAll
    ? products
    : products.filter((p) => p.status === "active" || !p.status);

  const firstLineWithProducts = productLines.find((pl) =>
    visibleProducts.some((p) => p.product_line_id === pl.id)
  );
  const [activeTab, setActiveTab] = useState(
    firstLineWithProducts?.id ?? productLines[0]?.id ?? ""
  );

  const activeLine = productLines.find((pl) => pl.id === activeTab);
  const filteredProducts = visibleProducts.filter(
    (p) => p.product_line_id === activeTab
  );

  return (
    <div className="space-y-4">
      {/* Tabs + nav actions */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {productLines.map((pl) => {
            const count = visibleProducts.filter(
              (p) => p.product_line_id === pl.id
            ).length;
            if (count === 0) return null;
            return (
              <button
                key={pl.id}
                onClick={() => setActiveTab(pl.id)}
                className={`cursor-pointer rounded-md px-3.5 py-1.5 text-sm font-medium transition-all ${
                  activeTab === pl.id
                    ? "bg-engenius-blue text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background"
                }`}
              >
                {pl.label}
                <span
                  className={`ml-1.5 tabular-nums ${
                    activeTab === pl.id
                      ? "text-white/70"
                      : "text-muted-foreground/60"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAll(!showAll)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              showAll
                ? "border-engenius-blue/30 text-engenius-blue bg-engenius-blue/5"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              {showAll ? (
                <path d="M1 8a7 7 0 1 0 14 0A7 7 0 0 0 1 8Zm4-1 2 2 4-4" />
              ) : (
                <path d="M1 8a7 7 0 1 0 14 0A7 7 0 0 0 1 8Zm10 0H5" />
              )}
            </svg>
            {showAll ? "All" : "Active"}
          </button>
          <Link
            href={`/compare/${encodeURIComponent(activeLine?.name ?? "")}`}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 2v12M12 2v12M4 8h8" />
            </svg>
            Compare
          </Link>
          <Link
            href={`/changelog/${encodeURIComponent(activeLine?.name ?? "")}`}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 4h10M3 8h7M3 12h5" />
            </svg>
            Change Log
          </Link>
        </div>
      </div>

      {/* Product table */}
      <div className="rounded-lg border bg-card shadow-sm">
        <ProductTable
          products={filteredProducts}
          lineCategory={activeLine?.category ?? ""}
        />
      </div>
    </div>
  );
}
