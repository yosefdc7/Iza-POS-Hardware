"use client";

import { useState, useEffect, useCallback, useTransition, useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Search,
  CheckCircle2,
  SlidersHorizontal,
  ArrowDownUp,
  Package,
  PlusCircle,
  ExternalLink,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { LowStockAlertItem, StockAlertSummary } from "@/lib/stock-alerts";
import { StockAdjustModal } from "@/components/products/stock-adjust-modal";

export interface AlertsWidgetProps {
  /**
   * Layout presentation variant
   * - "dashboard": Full-featured widget card designed for the reports / overview dashboard
   * - "pos": Streamlined widget designed for POS terminal screen with quick-add actions
   * - "compact": High-density preview
   */
  variant?: "dashboard" | "pos" | "compact";
  className?: string;
  maxItems?: number;
  title?: string;
  onSelectProduct?: (product: LowStockAlertItem) => void;
  showControls?: boolean;
}

type FilterTab = "all" | "out" | "low";
type SortOption = "critical" | "deficit" | "name" | "threshold";

export function AlertsWidget({
  variant = "dashboard",
  className,
  maxItems,
  title = "Stock Alerts",
  onSelectProduct,
  showControls = true,
}: AlertsWidgetProps) {
  const [items, setItems] = useState<LowStockAlertItem[]>([]);
  const [summary, setSummary] = useState<StockAlertSummary>({
    totalProducts: 0,
    totalBelowThreshold: 0,
    outOfStockCount: 0,
    lowStockCount: 0,
    hasCriticalStock: false,
  });
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("critical");

  // Stock Adjustment Modal state
  const [adjustTarget, setAdjustTarget] = useState<LowStockAlertItem | null>(null);

  const fetchAlerts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/products/low-stock?limit=150", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
        setSummary(
          data.summary ?? {
            totalProducts: 0,
            totalBelowThreshold: 0,
            outOfStockCount: 0,
            lowStockCount: 0,
            hasCriticalStock: false,
          }
        );
      }
    } catch (err) {
      console.warn("[AlertsWidget] Failed to load alerts", err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts(false);

    const handleStockChange = () => {
      startTransition(() => {
        fetchAlerts(true);
      });
    };

    window.addEventListener("pos:stock-changed", handleStockChange);
    window.addEventListener("focus", handleStockChange);

    const interval = setInterval(() => {
      fetchAlerts(true);
    }, 30000);

    return () => {
      window.removeEventListener("pos:stock-changed", handleStockChange);
      window.removeEventListener("focus", handleStockChange);
      clearInterval(interval);
    };
  }, [fetchAlerts]);

  // Filter and sort items
  const processedItems = useMemo(() => {
    let result = items.filter((item) => {
      if (filterTab === "out" && item.status !== "OUT_OF_STOCK") return false;
      if (filterTab === "low" && item.status !== "LOW_STOCK") return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.name.toLowerCase().includes(q);
        const matchSku = item.sku?.toLowerCase().includes(q);
        const matchCategory = item.category?.toLowerCase().includes(q);
        return matchName || matchSku || matchCategory;
      }
      return true;
    });

    result = [...result].sort((a, b) => {
      if (sortBy === "critical") {
        // Out of stock first, then lowest stock
        if (a.stock <= 0 && b.stock > 0) return -1;
        if (b.stock <= 0 && a.stock > 0) return 1;
        if (a.stock !== b.stock) return a.stock - b.stock;
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "deficit") {
        return b.deficit - a.deficit;
      }
      if (sortBy === "threshold") {
        return b.lowStockThreshold - a.lowStockThreshold;
      }
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      return 0;
    });

    if (maxItems && maxItems > 0) {
      return result.slice(0, maxItems);
    }
    return result;
  }, [items, filterTab, searchQuery, sortBy, maxItems]);

  const hasAlerts = summary.totalBelowThreshold > 0;
  const isSevere = summary.outOfStockCount > 0;

  return (
    <>
      <div
        className={cn(
          "bg-card rounded-lg border border-border/80 shadow-xs overflow-hidden flex flex-col transition-all",
          isSevere ? "border-destructive/30" : hasAlerts ? "border-amber-500/30" : "border-border/80",
          className
        )}
      >
        {/* Widget Header */}
        <div className="bg-muted/20 border-b border-border/80 px-4 py-3 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md border shrink-0 transition-colors",
                isSevere
                  ? "border-destructive/40 bg-destructive/15 text-destructive"
                  : hasAlerts
                    ? "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              )}
            >
              {isSevere ? (
                <AlertCircle className="h-4 w-4 animate-pulse" />
              ) : hasAlerts ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-foreground text-xs font-bold tracking-wider uppercase">
                  {title}
                </h2>
                {hasAlerts ? (
                  <span
                    className={cn(
                      "font-mono text-xs font-bold",
                      isSevere ? "text-destructive" : "text-amber-600 dark:text-amber-400"
                    )}
                  >
                    {summary.totalBelowThreshold} below threshold
                  </span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                    Healthy
                  </span>
                )}
              </div>

              {/* Unboxed Metadata Line per Zero-Pill Discipline */}
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                {hasAlerts ? (
                  <>
                    <span
                      className={cn(
                        "font-medium",
                        summary.outOfStockCount > 0 ? "text-destructive font-semibold" : ""
                      )}
                    >
                      {summary.outOfStockCount} out of stock
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-700 dark:text-amber-400 font-medium">
                      {summary.lowStockCount} low stock
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{summary.totalProducts} total catalog items</span>
                  </>
                ) : (
                  <span>All catalog products stocked above defined threshold</span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons in header */}
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={() => fetchAlerts(false)}
              disabled={loading || isPending}
              className="border-border/80 bg-card text-muted-foreground hover:text-foreground hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md border text-xs shadow-2xs transition-colors disabled:opacity-50"
              title="Refresh stock alerts"
              aria-label="Refresh stock alerts"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", (loading || isPending) && "animate-spin")} />
            </button>

            <Link
              href="/products"
              className="border-border/80 bg-card text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs font-semibold shadow-2xs transition-colors"
              title="View full catalog"
            >
              <Package className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Catalog</span>
            </Link>
          </div>
        </div>

        {/* Filter Controls Bar (Interactive Segmented Buttons & Search) */}
        {showControls && hasAlerts && (
          <div className="p-3 border-b border-border/60 bg-muted/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-md border border-border/60 self-start">
              <button
                type="button"
                onClick={() => setFilterTab("all")}
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold rounded-sm transition-all",
                  filterTab === "all"
                    ? "bg-card text-foreground shadow-2xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                All ({summary.totalBelowThreshold})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("out")}
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold rounded-sm transition-all",
                  filterTab === "out"
                    ? "bg-destructive/15 text-destructive font-bold shadow-2xs"
                    : "text-muted-foreground hover:text-destructive"
                )}
              >
                Out of Stock ({summary.outOfStockCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("low")}
                className={cn(
                  "px-2.5 py-1 text-xs font-semibold rounded-sm transition-all",
                  filterTab === "low"
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 font-bold shadow-2xs"
                    : "text-muted-foreground hover:text-amber-600"
                )}
              >
                Low Stock ({summary.lowStockCount})
              </button>
            </div>

            {/* Search & Sort Controls */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-44">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter alert items…"
                  className="w-full h-8 pl-8 pr-2.5 text-xs bg-card border border-border/80 rounded-md focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                />
              </div>

              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  aria-label="Sort alerts by"
                  className="h-8 pl-2 pr-6 text-xs bg-card border border-border/80 rounded-md text-muted-foreground hover:text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs cursor-pointer"
                >
                  <option value="critical">Sort: Critical First</option>
                  <option value="deficit">Sort: Largest Deficit</option>
                  <option value="threshold">Sort: Threshold (High)</option>
                  <option value="name">Sort: Product Name</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Content Body / Items List */}
        <div className="overflow-y-auto max-h-[420px] divide-y divide-border/60">
          {loading && items.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm space-y-2">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto text-muted-foreground/60" />
              <p className="text-xs">Checking stock levels against thresholds…</p>
            </div>
          ) : !hasAlerts ? (
            /* Affirmative Empty State when all stock is healthy */
            <div className="p-8 text-center space-y-2.5">
              <div className="h-10 w-10 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">All Stock Levels Healthy</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                  No products have fallen below their configured low-stock threshold. Inventory is
                  adequately stocked.
                </p>
              </div>
            </div>
          ) : processedItems.length === 0 ? (
            /* Empty Search / Filter State */
            <div className="p-6 text-center text-muted-foreground text-xs">
              No alerted products match the current filters or query.
            </div>
          ) : (
            processedItems.map((item) => {
              const isOutOfStock = item.status === "OUT_OF_STOCK";
              const percent = Math.min(100, Math.max(0, item.percentageRemaining));

              return (
                <div
                  key={item.id}
                  className={cn(
                    "p-3.5 hover:bg-muted/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3",
                    isOutOfStock ? "bg-destructive/5" : ""
                  )}
                >
                  {/* Left: Product Information */}
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Status indicator unboxed text per Zero-Pill discipline */}
                      <span
                        className={cn(
                          "font-mono text-[10px] font-extrabold tracking-wider uppercase",
                          isOutOfStock
                            ? "text-destructive"
                            : "text-amber-700 dark:text-amber-400"
                        )}
                      >
                        {isOutOfStock ? "OUT OF STOCK" : "LOW STOCK"}
                      </span>

                      <span aria-hidden="true" className="text-border">·</span>

                      <Link
                        href={`/products/${item.id}`}
                        className="text-foreground font-semibold text-sm hover:text-primary transition-colors truncate"
                      >
                        {item.name}
                      </Link>

                      {item.price > 0 && (
                        <span className="font-mono text-xs text-muted-foreground/80">
                          ({formatCurrency(item.price)})
                        </span>
                      )}
                    </div>

                    {/* Unboxed Metadata Line */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground font-mono">
                      {item.category && (
                        <>
                          <span>{item.category}</span>
                          <span aria-hidden="true">·</span>
                        </>
                      )}
                      {item.sku && (
                        <>
                          <span>SKU: {item.sku}</span>
                          <span aria-hidden="true">·</span>
                        </>
                      )}
                      <span>Unit: {item.unit}</span>
                    </div>

                    {/* Visual Depletion Gauge */}
                    <div className="w-full max-w-xs space-y-1 pt-1">
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-300",
                            isOutOfStock
                              ? "bg-destructive w-0"
                              : percent <= 25
                                ? "bg-destructive"
                                : percent <= 60
                                  ? "bg-amber-500"
                                  : "bg-yellow-500"
                          )}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right: Metrics & Action Buttons */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                    {/* Stock vs Threshold breakdown */}
                    <div className="text-right font-mono space-y-0.5">
                      <div className="flex items-baseline justify-end gap-1.5">
                        <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
                          Stock:
                        </span>
                        <span
                          className={cn(
                            "text-sm font-extrabold",
                            isOutOfStock
                              ? "text-destructive"
                              : "text-amber-600 dark:text-amber-400"
                          )}
                        >
                          {item.stock} {item.unit}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-end gap-1.5 text-xs text-muted-foreground">
                        <span>Threshold:</span>
                        <span className="font-semibold text-foreground">
                          {item.lowStockThreshold} {item.unit}
                        </span>
                      </div>

                      <div className="text-[11px] text-destructive/90 font-medium">
                        Shortage: -{item.deficit} {item.unit}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5">
                      {/* In POS variant: allow selecting / adding */}
                      {variant === "pos" && onSelectProduct && (
                        <button
                          type="button"
                          onClick={() => onSelectProduct(item)}
                          disabled={isOutOfStock}
                          className="h-8 px-2.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isOutOfStock ? "Out" : "Select"}
                        </button>
                      )}

                      {/* Stock Adjustment Trigger: Instant replenishment right from widget */}
                      <button
                        type="button"
                        onClick={() => setAdjustTarget(item)}
                        className="h-8 px-2.5 rounded-md border border-border/80 bg-card text-foreground hover:bg-accent text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors"
                        title="Quick Restock / Stock Adjustment"
                      >
                        <PlusCircle className="h-3.5 w-3.5 text-primary" />
                        <span className="hidden sm:inline">Adjust Stock</span>
                      </button>

                      {/* Product Edit Link */}
                      <Link
                        href={`/products/${item.id}/edit`}
                        className="h-8 w-8 rounded-md border border-border/80 bg-card text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center transition-colors shadow-2xs"
                        title="Edit Product & Threshold"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info bar when alerts exist */}
        {hasAlerts && (
          <div className="bg-muted/15 border-t border-border/60 px-4 py-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              Showing {processedItems.length} of {summary.totalBelowThreshold} alert items
            </span>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline">Threshold alerts update in real-time</span>
              <Link
                href="/products"
                className="text-primary font-semibold hover:underline"
              >
                Manage All Products →
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Stock Adjust Modal */}
      {adjustTarget && (
        <StockAdjustModal
          productId={adjustTarget.id}
          productName={adjustTarget.name}
          currentStock={adjustTarget.stock}
          unit={adjustTarget.unit || "pc"}
          onClose={() => {
            setAdjustTarget(null);
            fetchAlerts(true);
          }}
        />
      )}
    </>
  );
}
