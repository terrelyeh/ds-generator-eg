"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
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
  has_overview: boolean;
  has_features: boolean;
  radio_patterns: { band: string; h_plane: boolean; e_plane: boolean }[];
  last_content_changed: string | null;
  last_change_by: string | null;
  last_change_summary: string | null;
  updated_at: string;
  product_line_id: string;
  product_line: { name: string; label: string; category: string };
  translation_locales: string[];
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
function ImgStatus({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
  ) : (
    <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-muted-foreground/25" />
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
            className={`text-[11px] px-1.5 py-0 ${
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
          <TableHead className="w-8 text-center">#</TableHead>
          <TableHead className="w-28">Model #</TableHead>
          <TableHead className="w-56">Model Name</TableHead>
          <TableHead className="w-16 text-center">Version</TableHead>
          <TableHead className="w-20">Lang</TableHead>
          <TableHead className="w-24">Last Changed</TableHead>
          <TableHead className="w-14 text-center">OV</TableHead>
          <TableHead className="w-14 text-center">FT</TableHead>
          <TableHead className="w-14 text-center">Prod</TableHead>
          <TableHead className="w-14 text-center">HW</TableHead>
          {isAP && (
            <TableHead className="w-24 text-center">
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
                {product.current_version && product.current_version !== "0.0"
                  ? `v${product.current_version}`
                  : "—"}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex gap-1">
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">EN</span>
                {product.translation_locales.map((loc) => (
                  <span
                    key={loc}
                    className="rounded bg-engenius-blue/10 px-1.5 py-0.5 text-[11px] font-medium text-engenius-blue"
                  >
                    {loc.toUpperCase()}
                  </span>
                ))}
              </div>
            </TableCell>
            <TableCell
              className="tabular-nums text-muted-foreground"
              title={product.last_change_summary ?? ""}
            >
              {formatDate(product.last_content_changed)}
            </TableCell>
            <TableCell className="text-center">
              <ImgStatus ok={product.has_overview} />
            </TableCell>
            <TableCell className="text-center">
              <ImgStatus ok={product.has_features} />
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
    <Badge variant="outline" className={`text-[11px] px-1.5 py-0 ${config.className}`}>
      {config.label}
    </Badge>
  );
}

export function DashboardContent({
  productLines,
  products,
  initialLineId,
}: DashboardContentProps & { initialLineId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [showAll, setShowAll] = useState(false);

  const visibleProducts = showAll
    ? products
    : products.filter((p) => p.status === "active" || !p.status);

  const firstLineWithProducts = productLines.find((pl) =>
    visibleProducts.some((p) => p.product_line_id === pl.id)
  );
  const [activeTab, setActiveTab] = useState(
    initialLineId ?? firstLineWithProducts?.id ?? productLines[0]?.id ?? ""
  );

  function handleTabChange(lineId: string) {
    setActiveTab(lineId);
    const pl = productLines.find((p) => p.id === lineId);
    if (pl) {
      const slug = pl.name.toLowerCase().replace(/\s+/g, "-");
      router.replace(`${pathname}?line=${slug}`, { scroll: false });
    }
  }

  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    if (!activeLine) return;
    setSyncing(true);
    try {
      const res = await fetch(
        `/api/sync?force=true&line=${encodeURIComponent(activeLine.name)}`,
        { method: "POST" }
      );
      const data = await res.json();
      if (data.ok) {
        const result = data.results?.[0];
        const synced: string[] = result?.synced ?? [];
        const errors: string[] = result?.errors ?? [];

        if (synced.length === 0 && errors.length === 0) {
          toast.success(`${activeLine.label} is up to date`);
        } else {
          toast.success(`${activeLine.label} synced`, {
            description: synced.length > 0
              ? `${synced.length} models: ${synced.join(", ")}${errors.length > 0 ? ` | ${errors.length} errors` : ""}`
              : `${errors.length} errors`,
            duration: 8000,
          });
        }
        router.refresh();
      } else {
        toast.error(`Sync failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      toast.error(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  }

  const activeLine = productLines.find((pl) => pl.id === activeTab);
  const filteredProducts = visibleProducts.filter(
    (p) => p.product_line_id === activeTab
  );

  return (
    <div className="space-y-3">
      {/* Row 1: Product line tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {productLines.map((pl) => {
          const count = visibleProducts.filter(
            (p) => p.product_line_id === pl.id
          ).length;
          if (count === 0) return null;
          return (
            <button
              key={pl.id}
              onClick={() => handleTabChange(pl.id)}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all ${
                activeTab === pl.id
                  ? "bg-engenius-blue text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background"
              }`}
            >
              {pl.label}
              <span
                className={`ml-1 tabular-nums ${
                  activeTab === pl.id
                    ? "text-white/60"
                    : "text-muted-foreground/50"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Row 2: Actions */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setShowAll(!showAll)}
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            showAll
              ? "bg-engenius-blue/10 text-engenius-blue"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          {showAll ? "All" : "Active"}
        </button>
        <span className="text-border">|</span>
        <Link
          href={`/compare/${encodeURIComponent(activeLine?.name ?? "")}`}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          Compare
        </Link>
        <Link
          href={`/changelog/${encodeURIComponent(activeLine?.name ?? "")}`}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          Changelog
        </Link>
        <Link
          href={`/translations/${encodeURIComponent(activeLine?.name ?? "")}`}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          Translations
        </Link>
        <span className="text-border">|</span>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M1 8a7 7 0 0 1 13.1-3.5M15 8a7 7 0 0 1-13.1 3.5" />
            <path d="M14 1v4h-4M2 15v-4h4" />
          </svg>
          {syncing ? "Syncing..." : "Sync"}
        </button>
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
