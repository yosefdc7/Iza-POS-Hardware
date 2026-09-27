"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Search, Plus, AlertTriangle, Barcode, FilterX } from "lucide-react";
import { useCartStore } from "@/store/cart";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "sonner";
import { getDeviceSettings, playErrorBeep } from "@/hooks/use-device-settings";
import { LowStockBanner } from "./low-stock-banner";
import { AlertsWidget } from "@/components/dashboard/alerts-widget";

interface PackagingOption {
  id: string;
  name: string;
  conversionQty: number;
  price: number;
  barcode: string | null;
}

interface ProductResult {
  id: string;
  name: string;
  price: number;
  stock: number;
  unit: string;
  quantityPrecision: number;
  lowStockThreshold?: number;
  barcode?: string | null;
  sku?: string | null;
  category?: string | null;
  tag?: string | null;
  imageUrl?: string | null;
  packagings?: PackagingOption[];
}

export function ProductSearch() {
  const t = useTranslations("pos");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductResult[]>([]);
  const [allProducts, setAllProducts] = useState<ProductResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [gridLoading, setGridLoading] = useState(true);
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"catalog" | "alerts">("catalog");
  const [packagingPicker, setPackagingPicker] = useState<ProductResult | null>(null);
  const addItem = useCartStore((s) => s.addItem);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeypressRef = useRef<number>(0);

  const loadGrid = useCallback(async () => {
    setGridLoading(true);
    try {
      const res = await fetch("/api/products/search?q=&limit=60");
      if (res.ok) {
        const data = await res.json();
        setAllProducts(data);
      }
    } catch {
      // ignore — grid is optional
    } finally {
      setGridLoading(false);
    }
  }, []);

  // Load all products on mount for the quick-add grid
  useEffect(() => {
    loadGrid();
  }, [loadGrid]);

  // Re-load grid whenever stock changes in POS (sales completed, stock adjustments)
  useEffect(() => {
    const handleStockChange = () => {
      loadGrid();
    };
    window.addEventListener("pos:stock-changed", handleStockChange);
    return () => window.removeEventListener("pos:stock-changed", handleStockChange);
  }, [loadGrid]);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const { searchProductsOffline } = await import("@/lib/pglite");
        const data = await searchProductsOffline(q);
        setResults(data.map((product) => ({
          ...product,
          unit: "unit" in product && typeof product.unit === "string" ? product.unit : "pc",
          quantityPrecision: "quantityPrecision" in product && typeof product.quantityPrecision === "number" ? product.quantityPrecision : 0,
        })));
      } else {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(data);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Show toast when barcode scan returns no result
  const prevResultsRef = useRef<ProductResult[]>([]);
  useEffect(() => {
    const isBarcodeLike = /^[A-Za-z0-9]{6,20}$/.test(query.trim()) && results.length === 0 && prevResultsRef.current !== results && !loading && query.trim().length > 0;
    if (isBarcodeLike) {
      toast.error(`Product not found: "${query.trim()}"`, { id: "barcode-not-found", duration: 3000 });
      const deviceSettings = getDeviceSettings();
      if (deviceSettings.scannerBeepEnabled) playErrorBeep();
    }
    prevResultsRef.current = results;
  }, [results, query, loading]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const now = Date.now();
    const timeSinceLast = now - lastKeypressRef.current;
    lastKeypressRef.current = now;
    const delay = timeSinceLast < 30 ? 50 : 250;
    debounceRef.current = setTimeout(() => search(val), delay);
  }

  function addToCart(product: ProductResult, packaging?: PackagingOption) {
    addItem({
      productId: product.id,
      name: product.name,
      price: packaging ? packaging.price : product.price,
      stock: product.stock,
      lowStockThreshold: product.lowStockThreshold ?? 5,
      unit: product.unit,
      quantityPrecision: product.quantityPrecision,
      packagingId: packaging?.id,
      packagingName: packaging?.name,
      packagingQty: packaging?.conversionQty,
    });
    setQuery("");
    setResults([]);
    setPackagingPicker(null);
  }

  function handleSelect(product: ProductResult) {
    const packagings = product.packagings ?? [];

    // If scanned query matches a packaging barcode, auto-add that packaging
    const matchedPkg = packagings.find((pkg) => pkg.barcode && pkg.barcode === query.trim());
    if (matchedPkg) {
      addToCart(product, matchedPkg);
      return;
    }

    // If product has packagings, show picker (unless it's a direct barcode scan of the product itself)
    const isProductBarcodeScan = product.barcode && product.barcode === query.trim();
    if (packagings.length > 0 && !isProductBarcodeScan) {
      setPackagingPicker(product);
      setQuery("");
      setResults([]);
      return;
    }

    // Default: add as base unit
    addToCart(product);
  }

  const showSearchResults = Boolean(query.trim());

  const displayedProducts = filterLowStockOnly
    ? allProducts.filter((p) => p.stock <= (p.lowStockThreshold ?? 5))
    : allProducts;

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Explicit Low-Stock Alert Banner in POS Layout */}
      <LowStockBanner
        onFilterLowStock={setFilterLowStockOnly}
        isFilterActive={filterLowStockOnly}
        onOpenAlertsWidget={() => setViewMode("alerts")}
      />

      {/* Filter Active Notice */}
      {filterLowStockOnly && (
        <div className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            <span>
              Showing {displayedProducts.length} product{displayedProducts.length === 1 ? "" : "s"} at or below their defined low-stock threshold
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFilterLowStockOnly(false)}
            className="flex items-center gap-1 rounded bg-background/90 hover:bg-background border border-border px-2 py-0.5 text-xs font-semibold text-foreground transition-colors"
          >
            <FilterX className="h-3 w-3" />
            <span>Show All</span>
          </button>
        </div>
      )}

      {/* Packaging picker overlay */}
      {packagingPicker && (
        <div className="shrink-0 rounded-lg border border-primary/30 bg-card shadow-md p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">{packagingPicker.name}</p>
              <p className="text-xs text-muted-foreground">Select packaging size</p>
            </div>
            <button
              onClick={() => setPackagingPicker(null)}
              className="hover:bg-muted rounded-md p-1 text-muted-foreground"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {/* Base unit option */}
            <button
              onClick={() => addToCart(packagingPicker)}
              className="flex flex-col items-start rounded-md border px-3 py-2 text-left hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <span className="text-xs text-muted-foreground">Individual {packagingPicker.unit}</span>
              <span className="font-bold text-primary font-mono">
                {packagingPicker.price.toLocaleString("en-PH", { style: "currency", currency: "PHP" })}
              </span>
            </button>
            {/* Packaging options */}
            {(packagingPicker.packagings ?? []).map((pkg) => (
              <button
                key={pkg.id}
                onClick={() => addToCart(packagingPicker, pkg)}
                disabled={(packagingPicker.stock ?? 0) < pkg.conversionQty}
                className="flex flex-col items-start rounded-md border px-3 py-2 text-left hover:border-primary/50 hover:bg-muted/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-xs text-muted-foreground">{pkg.name} ({pkg.conversionQty} {packagingPicker.unit}s)</span>
                <span className="font-bold text-primary font-mono">
                  {pkg.price.toLocaleString("en-PH", { style: "currency", currency: "PHP" })}
                </span>
                {(packagingPicker.stock ?? 0) < pkg.conversionQty && (
                  <span className="text-[10px] text-destructive">Insufficient stock</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="relative shrink-0">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          id="pos-search-input"
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results.length > 0) {
              e.preventDefault();
              handleSelect(results[0]);
            } else if (e.key === "Escape") {
              setQuery("");
              setResults([]);
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder={t("search_placeholder") || "Search products or scan barcode (F1)..."}
          className="border-border/80 bg-card text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:ring-primary flex h-11 w-full rounded-lg border pl-10 pr-10 py-2 text-sm outline-none focus-visible:ring-2 shadow-xs transition-all"
          autoFocus
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground/60">
          <Barcode className="h-4 w-4" />
        </div>
      </div>

      {/* Search results */}
      {showSearchResults && (
        <div className="shrink-0">
          {loading && (
            <p className="text-xs text-muted-foreground px-1 py-2">Searching products...</p>
          )}
          {!loading && results.length === 0 && (
            <p className="text-xs text-muted-foreground px-1 py-2">No products matching &quot;{query}&quot;</p>
          )}
          {results.length > 0 && (
            <div className="rounded-lg border border-border bg-card divide-y divide-border/60 overflow-hidden shadow-xs">
              {results.map((p) => {
                const threshold = p.lowStockThreshold ?? 5;
                const isZero = p.stock <= 0;
                const isLow = p.stock > 0 && p.stock <= threshold;

                return (
                  <button
                    key={p.id}
                    onClick={() => handleSelect(p)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{p.name}</p>
                        {p.tag && (
                          <span
                            className={cn(
                              "text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0",
                              p.tag === "CHB"
                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                                : p.tag === "211"
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30"
                            )}
                          >
                            {p.tag}
                          </span>
                        )}
                        {isZero && (
                          <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/30">
                            OUT OF STOCK
                          </span>
                        )}
                        {isLow && (
                          <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                            LOW STOCK
                          </span>
                        )}
                      </div>
                      {p.sku && (
                        <p className="text-xs text-muted-foreground font-mono">SKU: {p.sku}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold font-mono text-primary">{formatCurrency(p.price)}</p>
                      <p
                        className={cn(
                          "text-[11px] font-mono",
                          isZero
                            ? "text-destructive font-bold"
                            : isLow
                              ? "text-amber-600 dark:text-amber-400 font-semibold"
                              : "text-muted-foreground"
                        )}
                      >
                        {isZero
                          ? `Out (0/${threshold} ${p.unit})`
                          : isLow
                            ? `Low (${p.stock}/${threshold} ${p.unit})`
                            : `Stock: ${p.stock} ${p.unit}`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* View Mode Switcher between Catalog Grid and Alerts Widget */}
      {!showSearchResults && (
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-md border border-border/60 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("catalog")}
              className={cn(
                "px-2.5 py-1 rounded-sm font-semibold transition-all",
                viewMode === "catalog"
                  ? "bg-card text-foreground shadow-2xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Catalog Grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode("alerts")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-sm font-semibold transition-all",
                viewMode === "alerts"
                  ? "bg-amber-500/20 text-amber-700 dark:text-amber-400 font-bold shadow-2xs"
                  : "text-muted-foreground hover:text-amber-600"
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              <span>Alerts Widget</span>
            </button>
          </div>
          {viewMode === "alerts" && (
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              Select or adjust products below threshold
            </span>
          )}
        </div>
      )}

      {/* Render Alerts Widget if in alerts view mode */}
      {!showSearchResults && viewMode === "alerts" && (
        <div className="flex-1 overflow-y-auto pr-1">
          <AlertsWidget
            variant="pos"
            title="POS Low-Stock Alerts"
            onSelectProduct={(item) => {
              const found = allProducts.find((p) => p.id === item.id);
              if (found) {
                handleSelect(found);
              } else {
                handleSelect({
                  id: item.id,
                  name: item.name,
                  price: item.price,
                  stock: item.stock,
                  unit: item.unit,
                  quantityPrecision: 0,
                  lowStockThreshold: item.lowStockThreshold,
                  sku: item.sku,
                  category: item.category,
                });
              }
            }}
          />
        </div>
      )}

      {/* Quick-add product grid with Variant A linear cards */}
      {!showSearchResults && viewMode === "catalog" && (
        <div className="flex-1 overflow-y-auto pr-1">
          {gridLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-24 rounded-lg border border-border/60 bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : displayedProducts.length === 0 ? (
            <div className="flex flex-col h-48 items-center justify-center rounded-lg border border-dashed border-border/80 text-muted-foreground text-sm p-4 text-center">
              <p>
                {filterLowStockOnly
                  ? "No products currently below their defined low-stock threshold!"
                  : "No products found in catalog"}
              </p>
              {filterLowStockOnly && (
                <button
                  type="button"
                  onClick={() => setFilterLowStockOnly(false)}
                  className="mt-2 text-xs font-semibold text-primary underline hover:no-underline"
                >
                  Show all products
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
              {displayedProducts.map((p) => {
                const threshold = p.lowStockThreshold ?? 5;
                const isZero = p.stock <= 0;
                const isLow = p.stock > 0 && p.stock <= threshold;

                return (
                  <button
                    key={p.id}
                    onClick={() => handleSelect(p)}
                    disabled={isZero}
                    className={cn(
                      "group relative flex flex-col justify-between rounded-lg border p-3 text-left transition-all min-h-[5.5rem] shadow-xs",
                      isZero
                        ? "opacity-60 cursor-not-allowed bg-muted/30 border-destructive/30"
                        : isLow
                          ? "border-amber-500/40 bg-card hover:border-amber-500/70 hover:bg-amber-500/5 cursor-pointer"
                          : "border-border/80 hover:border-primary/50 hover:bg-muted/40 hover:shadow-xs active:scale-[0.99] cursor-pointer bg-card"
                    )}
                  >
                    <div className="flex w-full items-start justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold leading-tight line-clamp-2 text-foreground group-hover:text-primary transition-colors">
                          {p.name}
                        </p>
                        {p.tag && (
                          <span
                            className={cn(
                              "text-[9px] font-bold px-1.5 py-0.2 rounded-full border inline-block mt-0.5",
                              p.tag === "CHB"
                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                                : p.tag === "211"
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30"
                            )}
                          >
                            {p.tag}
                          </span>
                        )}
                      </div>
                      <div className="h-5 w-5 rounded-md border border-border/60 flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:border-primary/40 transition-colors shrink-0">
                        <Plus className="h-3 w-3" />
                      </div>
                    </div>

                    {p.imageUrl ? (
                      <div className="flex w-full justify-center my-1">
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className="rounded-md object-cover h-14 w-full"
                        />
                      </div>
                    ) : null}

                    {/* Bottom Line Info */}
                    <div className="flex w-full items-baseline justify-between mt-2 pt-1.5 border-t border-border/50">
                      <span className="text-sm font-bold font-mono text-primary">
                        {formatCurrency(p.price)}
                      </span>
                      {isZero && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-destructive">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          Out (0/{threshold})
                        </span>
                      )}
                      {isLow && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          {p.stock}/{threshold}
                        </span>
                      )}
                      {!isZero && !isLow && (
                        <span className="text-[10px] text-muted-foreground/80 font-mono">
                          {p.stock} left
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
