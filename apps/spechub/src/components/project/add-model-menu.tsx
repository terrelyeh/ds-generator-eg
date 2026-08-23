"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CatalogProduct {
  model: string;
  name: string;
  line: string;
  category: string;
  status: string;
}

/**
 * Adding a column, by where its specs are going to come from.
 *
 * All three end in the same place — a column on the spec table — but naming
 * them by their SOURCE is what makes them findable. Sourcing is the reason
 * this module exists, and it used to be the one path not on this menu: you
 * had to add a blank column, then discover the vendor upload buried inside
 * it. "從廠商規格書建立" creates the column and takes you to that upload.
 */
export function AddModelMenu({
  docId,
  onAdded,
}: {
  docId: string;
  /** `focusSource` asks the editor to open that column at its upload box */
  onAdded: (id?: string, focusSource?: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || products) return;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${docId}/seed-from-product`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "讀取產品清單失敗");
        setProducts(json.products);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "讀取產品清單失敗");
        setProducts([]);
      }
    })();
  }, [open, products, docId]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!products) return [];
    if (!q) return products.slice(0, 12);
    return products
      .filter((p) =>
        [p.model, p.name, p.line, p.category].some((f) => f.toLowerCase().includes(q)),
      )
      .slice(0, 12);
  }, [products, query]);

  async function addBlank(focusSource = false) {
    const modelName = window.prompt(
      focusSource
        ? "先給這一欄一個型號名稱（我們要對外用的，例如 EOR100）"
        : "型號名稱（例如 EOR100）",
    )?.trim();
    if (!modelName) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${docId}/models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_name: modelName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "新增失敗");
      onAdded(json.id, focusSource);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "新增失敗");
    } finally {
      setBusy(false);
    }
  }

  async function seed(product: CatalogProduct) {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${docId}/seed-from-product`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productModel: product.model }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "帶入失敗");
      // The copy is named, not counted. "3 fields" says nothing; "主標、
      // Overview" tells you which boxes to go and read before printing.
      const copy: string[] = Array.isArray(json.seededCopy) ? json.seededCopy : [];
      toast.success(
        `帶入 ${product.model}：${json.rows} 列規格、${json.images} 張圖` +
          (copy.length ? `，封面文案也帶了（${copy.join("、")}）` : ""),
      );
      setOpen(false);
      setQuery("");
      onAdded(json.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "帶入失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full space-y-3">
      {/* The row stays put when the search panel opens.
          It used to be REPLACED by the panel, which took away more than a
          cancel button: with the other two buttons gone there was no way to
          see that another route existed, let alone switch to it. The way out
          of a choice should be the same control you made it with. */}
      <div className="flex flex-wrap gap-2">
        {/* Ordered by how often each is the answer, sourcing first — it is
            what this module was built for. */}
        <Button
          size="sm"
          variant={open ? "outline" : "default"}
          onClick={() => void addBlank(true)}
          disabled={busy}
        >
          從廠商規格書建立
        </Button>
        <Button
          variant={open ? "default" : "outline"}
          size="sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          從既有型號帶入
        </Button>
        <Button variant="outline" size="sm" onClick={() => void addBlank()} disabled={busy}>
          加空白型號
        </Button>
        {open && (
          <button
            type="button"
            className="px-1 text-xs text-muted-foreground hover:text-[#231f20] hover:underline"
            onClick={() => {
              setOpen(false);
              setQuery("");
            }}
          >
            取消
          </button>
        )}
      </div>

      {open && (
        <div className="w-full space-y-2 rounded-md border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">
            帶入我們已經在賣的型號：規格、文案、產品圖一起複製過來，之後可以自由增修。
            <strong>官方 datasheet 沒寫的欄位就直接加</strong>——標案要的細節本來就比公開規格多。動到官方已經寫過的值會被標成「跟官方不一樣」，因為客戶對得到。
          </p>
          <Input
        autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋型號、產品線…（ECW536、Cloud AP、EOC…）"
          />
          {products === null ? (
            <p className="text-xs text-muted-foreground">載入產品清單…</p>
          ) : matches.length === 0 ? (
            <p className="text-xs text-muted-foreground">沒有符合的型號。</p>
          ) : (
            <ul className="max-h-64 divide-y overflow-y-auto rounded-md border bg-background">
              {matches.map((p) => (
                <li key={p.model}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void seed(p)}
                    className="flex w-full items-baseline gap-2 px-3 py-2 text-left hover:bg-muted disabled:opacity-50"
                  >
                    <span className="font-medium text-[#231f20]">{p.model}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {p.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{p.line}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
