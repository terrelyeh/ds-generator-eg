"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ProductLine } from "@/types/database";

interface ProductSummary {
  id: string;
  model_name: string;
  subtitle: string;
  full_name: string;
  current_version: string;
  product_image: string;
  sheet_last_modified: string | null;
  sheet_last_editor: string | null;
  updated_at: string;
  product_line_id: string;
  product_line: { name: string; label: string; category: string };
  image_readiness: { total: number; ready: number };
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

function ImageReadinessBadge({
  readiness,
}: {
  readiness: { total: number; ready: number };
}) {
  if (readiness.total === 0) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        No images
      </Badge>
    );
  }
  const allReady = readiness.ready === readiness.total;
  return (
    <Badge variant={allReady ? "default" : "secondary"}>
      {readiness.ready}/{readiness.total}
    </Badge>
  );
}

function ProductTable({ products }: { products: ProductSummary[] }) {
  if (products.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No products found in this product line.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[50px] text-center">#</TableHead>
          <TableHead>Model</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Version</TableHead>
          <TableHead>Last Edited</TableHead>
          <TableHead>Edited By</TableHead>
          <TableHead>Images</TableHead>
          <TableHead className="w-[100px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product, index) => (
          <TableRow key={product.id}>
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
            <TableCell className="max-w-[300px] truncate text-sm text-muted-foreground">
              {product.subtitle || product.full_name}
            </TableCell>
            <TableCell>
              <Badge variant="outline" className="tabular-nums">
                v{product.current_version}
              </Badge>
            </TableCell>
            <TableCell className="text-sm tabular-nums">
              {formatDate(product.sheet_last_modified ?? product.updated_at)}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {product.sheet_last_editor ?? "—"}
            </TableCell>
            <TableCell>
              <ImageReadinessBadge readiness={product.image_readiness} />
            </TableCell>
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

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl bg-engenius-blue/5 border border-engenius-blue/15 px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wider text-engenius-blue/70">
        {label}
      </p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-engenius-dark">
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

export function DashboardContent({
  productLines,
  products,
}: DashboardContentProps) {
  const router = useRouter();
  // Default to first product line that has products
  const firstLineWithProducts = productLines.find((pl) =>
    products.some((p) => p.product_line_id === pl.id)
  );
  const [activeTab, setActiveTab] = useState(
    firstLineWithProducts?.id ?? productLines[0]?.id ?? ""
  );
  const [syncing, setSyncing] = useState(false);

  const filteredProducts = products.filter(
    (p) => p.product_line_id === activeTab
  );

  async function handleSync() {
    setSyncing(true);
    try {
      // Sync only the active product line
      const activeLine = productLines.find((pl) => pl.id === activeTab);
      const lineParam = activeLine
        ? `&line=${encodeURIComponent(activeLine.name)}`
        : "";
      const res = await fetch(`/api/sync?force=true${lineParam}`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.ok) {
        const totalSynced = data.results.reduce(
          (sum: number, r: { synced: string[] }) => sum + r.synced.length,
          0
        );
        const lineName = activeLine?.label ?? "All";
        const msg = totalSynced > 0
          ? `${lineName}: ${totalSynced} products synced.`
          : `${lineName}: all data is up to date.`;
        alert(msg);
        router.refresh();
      } else {
        alert(`Sync failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      alert(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  }

  const totalProducts = products.length;
  const imagesReady = products.filter(
    (p) =>
      p.image_readiness.total > 0 &&
      p.image_readiness.ready === p.image_readiness.total
  ).length;

  // Find the most recent edit across all products
  const latestEdit = products.reduce<string | null>((latest, p) => {
    const d = p.sheet_last_modified ?? p.updated_at;
    if (!latest) return d;
    return d > latest ? d : latest;
  }, null);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <KpiCard label="Total Products" value={totalProducts} />
        <KpiCard label="Product Lines" value={productLines.length} />
        <KpiCard
          label="Images Ready"
          value={`${imagesReady}/${totalProducts}`}
          sub={imagesReady === totalProducts ? "All complete" : "Some missing"}
        />
        <KpiCard
          label="Last Sync"
          value={latestEdit ? formatDate(latestEdit) : "—"}
          sub="From Google Sheets"
        />
      </div>

      {/* Tabs + table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          {/* Product line tabs with background */}
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
              href={`/compare/${encodeURIComponent(
                productLines.find((pl) => pl.id === activeTab)?.name ?? ""
              )}`}
              className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              Compare
            </Link>
            <Link
              href={`/changelog/${encodeURIComponent(
                productLines.find((pl) => pl.id === activeTab)?.name ?? ""
              )}`}
              className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              Change Log
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? "Syncing..." : "Sync from Sheets"}
            </Button>
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          <ProductTable products={filteredProducts} />
        </div>
      </div>

    </div>
  );
}
