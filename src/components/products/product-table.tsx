"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Pencil, Trash2, AlertTriangle, PackagePlus, Package, Search } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { StockAdjustModal } from "./stock-adjust-modal";
import { computeStockBreakdown } from "@/lib/hardware-units";
import { ProductExportButton } from "./product-export-button";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  price: { toString(): string };
  stock: { toString(): string };
  unit?: string;
  lowStockThreshold: { toString(): string };
  category: string | null;
  tag?: string | null;
  active: boolean;
  packagings?: Array<{ id: string; name: string; conversionQty: number | { toString(): string }; price: { toString(): string } }>;
}

interface ProductTableProps {
  products: Product[];
  isStaff?: boolean;
}

export function ProductTable({ products, isStaff=false }: ProductTableProps) {
  const t = useTranslations("products");
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  async function archive(id:string) {
    const reason=window.prompt(isStaff?'Reason for requesting deletion:':'Reason for archiving this item:');
    if(!reason?.trim()) return;
    setBusy(true);
    try {
      const res=await fetch('/api/product-approvals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:id,operation:'ARCHIVE',reason})});
      const data=await res.json();if(!res.ok) throw new Error(data.error);
      toast.success(isStaff?'Deletion submitted for admin approval':'Item archived');router.refresh();
    }catch(e){toast.error(e instanceof Error?e.message:'Unable to archive');}finally{setBusy(false);}
  }
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [selectedTag, setSelectedTag] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.tag) set.add(p.tag);
    });
    return Array.from(set);
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (selectedTag === "ALL") {
        // match
      } else if (selectedTag === "UNTAGGED") {
        if (p.tag) return false;
      } else if (p.tag !== selectedTag) {
        return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesSku = p.sku?.toLowerCase().includes(q) ?? false;
        const matchesCat = p.category?.toLowerCase().includes(q) ?? false;
        const matchesTag = p.tag?.toLowerCase().includes(q) ?? false;
        if (!matchesName && !matchesSku && !matchesCat && !matchesTag) return false;
      }
      return true;
    });
  }, [products, selectedTag, search]);

  if (products.length === 0) {
    return (
      <div className="flex flex-col h-48 items-center justify-center rounded-lg border border-dashed border-border/80 text-muted-foreground text-sm bg-card/40 p-6 text-center">
        <Package className="h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="font-semibold text-foreground/70">{t("no_products")}</p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">{t("add_first")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search name, SKU, tag, category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-md border border-input bg-background"
          />
        </div>

        {/* Tag Filters & Export */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 border rounded-md p-0.5 bg-muted/40">
            <button
              onClick={() => setSelectedTag("ALL")}
              className={cn(
                "px-2.5 py-1 text-xs font-semibold rounded transition-colors",
                selectedTag === "ALL" ? "bg-background text-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
              )}
            >
              All
            </button>
            <button
              onClick={() => setSelectedTag("CHB")}
              className={cn(
                "px-2.5 py-1 text-xs font-semibold rounded transition-colors",
                selectedTag === "CHB" ? "bg-blue-600 text-white shadow-2xs" : "text-muted-foreground hover:text-foreground"
              )}
            >
              CHB
            </button>
            <button
              onClick={() => setSelectedTag("211")}
              className={cn(
                "px-2.5 py-1 text-xs font-semibold rounded transition-colors",
                selectedTag === "211" ? "bg-amber-600 text-white shadow-2xs" : "text-muted-foreground hover:text-foreground"
              )}
            >
              211
            </button>
            {availableTags.filter((t) => t !== "CHB" && t !== "211").map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTag(t)}
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold rounded transition-colors",
                  selectedTag === t ? "bg-purple-600 text-white shadow-2xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <ProductExportButton selectedTag={selectedTag} />
        </div>
      </div>

      <div className="rounded-lg border border-border/80 bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="border-b border-border/80 bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90">
                  {t("name")}
                </th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90">
                  {t("sku")}
                </th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90">
                  {t("category")}
                </th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90 text-right">
                  {t("price")}
                </th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90 text-right">
                  {t("stock")}
                </th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/90 text-center">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredProducts.map((product) => {
                const stock = Number(product.stock);
                const threshold = Number(product.lowStockThreshold);
                const isLowStock = stock <= threshold;
                const isOutOfStock = stock === 0;
                const breakdown = computeStockBreakdown(stock, product.unit || "pc", product.packagings);

                return (
                  <tr key={product.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3.5 font-medium">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/products/${product.id}`}
                          className="font-semibold text-foreground hover:text-primary transition-colors"
                        >
                          {product.name}
                        </Link>
                        {product.tag && (
                          <span
                            className={cn(
                              "text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0",
                              product.tag === "CHB"
                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                                : product.tag === "211"
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30"
                            )}
                          >
                            {product.tag}
                          </span>
                        )}
                        {!product.active && (
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/60">
                            Inactive
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">
                      {product.sku ?? "—"}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">
                      {product.category ? (
                        <span className="inline-block rounded-md bg-muted/60 px-2 py-0.5 font-medium">
                          {product.category}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-foreground">
                      {formatCurrency(parseFloat(product.price.toString()))}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {isOutOfStock ? (
                        <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-destructive bg-destructive/10 px-2 py-0.5 rounded-full border border-destructive/20">
                          {t("out_of_stock_badge")}
                        </span>
                      ) : (
                        <div>
                          <span className={`font-mono text-xs font-semibold ${isLowStock ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                            {stock} <span className="font-normal text-muted-foreground">{product.unit || "pc"}</span>
                          </span>
                          {breakdown && (
                            <p className="text-[11px] text-muted-foreground font-medium">
                              ({breakdown.formattedText})
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setAdjusting(product)}
                          className="rounded-md p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Adjust Stock"
                        >
                          <PackagePlus className="h-4 w-4" />
                        </button>
                        <Link
                          href={`/products/${product.id}/edit`}
                          className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          title="Edit Product"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <div>
                          <button
                            type="submit"
                            className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title={isStaff?"Request deletion":"Archive Product"}
                            disabled={busy || !product.active}
                            onClick={()=>archive(product.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {adjusting && (
        <StockAdjustModal
          productId={adjusting.id}
          productName={adjusting.name}
          currentStock={Number(adjusting.stock)}
          unit={adjusting.unit || "pc"}
          packagings={adjusting.packagings || []}
          isStaff={isStaff}
          onClose={() => setAdjusting(null)}
        />
      )}
    </>
  );
}
