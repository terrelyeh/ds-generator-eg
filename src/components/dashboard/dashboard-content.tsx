"use client";

import { useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    return <Badge variant="outline">No images</Badge>;
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
          <TableHead>Model</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Version</TableHead>
          <TableHead>Last Edited</TableHead>
          <TableHead>Edited By</TableHead>
          <TableHead>Images</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
          <TableRow key={product.id}>
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
              <Badge variant="outline">v{product.current_version}</Badge>
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
  const [activeTab, setActiveTab] = useState("all");

  const filteredProducts =
    activeTab === "all"
      ? products
      : products.filter((p) => p.product_line_id === activeTab);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="all">
          All ({products.length})
        </TabsTrigger>
        {productLines.map((pl) => {
          const count = products.filter(
            (p) => p.product_line_id === pl.id
          ).length;
          return (
            <TabsTrigger key={pl.id} value={pl.id}>
              {pl.label} ({count})
            </TabsTrigger>
          );
        })}
      </TabsList>

      <TabsContent value={activeTab} className="mt-4">
        <div className="rounded-lg border bg-card">
          <ProductTable products={filteredProducts} />
        </div>
      </TabsContent>
    </Tabs>
  );
}
