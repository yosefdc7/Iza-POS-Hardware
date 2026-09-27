"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, ArrowRight, ArrowUpRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LowStockBannerItem {
  id: string;
  name: string;
  stock: number;
  lowStockThreshold: number;
  unit?: string;
  sku?: string | null;
  category?: string | null;
}

interface DashboardStockWarningBannerProps {
  items: LowStockBannerItem[];
  onViewLowStockTab?: () => void;
  onNavigateToReorder?: () => void;
  className?: string;
}

export function DashboardStockWarningBanner({
  items,
  onViewLowStockTab,
  onNavigateToReorder,
  className,
}: DashboardStockWarningBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [prevStockHash, setPrevStockHash] = useState("");

  const outOfStockItems = items.filter((i) => i.stock <= 0);
  const lowStockItems = items.filter((i) => i.stock > 0 && i.stock <= i.lowStockThreshold);
  const totalCount = items.length;
  const hasOutOfStock = outOfStockItems.length > 0;

  // Compute a snapshot hash of current stock counts so if stock drops further, the banner automatically re-appears
  const currentStockHash = items.map((i) => `${i.id}:${i.stock}`).join(",");

  useEffect(() => {
    if (prevStockHash && currentStockHash !== prevStockHash) {
      // Stock changed (e.g. sale completed), un-dismiss banner automatically
      setDismissed(false);
    }
    setPrevStockHash(currentStockHash);
  }, [currentStockHash, prevStockHash]);

  if (totalCount === 0 || dismissed) {
    return null;
  }

  // Pick top 3 urgent items for preview
  const urgentPreview = items.slice(0, 3);

  return (
    <div
      role="alert"
      data-testid="dashboard-low-stock-banner"
      className={cn(
        "relative overflow-hidden rounded-xl border p-4 sm:p-5 shadow-xs transition-all",
        hasOutOfStock
          ? "border-destructive/30 bg-destructive/5 text-destructive dark:bg-destructive/10"
          : "border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200 dark:bg-amber-500/10",
        className
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        {/* Icon & Message content */}
        <div className="flex items-start gap-3.5">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
              hasOutOfStock
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400"
            )}
          >
            {hasOutOfStock ? (
              <AlertCircle className="h-5 w-5 animate-pulse" />
            ) : (
              <AlertTriangle className="h-5 w-5" />
            )}
          </div>

          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h3 className="text-sm font-bold tracking-tight text-foreground">
                {hasOutOfStock
                  ? `Critical Stock Alert: ${outOfStockItems.length} item(s) out of stock`
                  : `Low Stock Warning: ${lowStockItems.length} product(s) below threshold`}
              </h3>

              {/* Unboxed metadata status indicators per zero-pill discipline */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                {outOfStockItems.length > 0 && (
                  <span className="font-semibold text-destructive">
                    {outOfStockItems.length} Out of Stock
                  </span>
                )}
                {outOfStockItems.length > 0 && lowStockItems.length > 0 && (
                  <span aria-hidden="true">·</span>
                )}
                {lowStockItems.length > 0 && (
                  <span className="text-amber-700 dark:text-amber-400 font-semibold">
                    {lowStockItems.length} Low Stock
                  </span>
                )}
              </div>
            </div>

            {/* List of most urgent items */}
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span>Attention required for: </span>
              {urgentPreview.map((item, index) => (
                <span key={item.id} className="font-medium text-foreground">
                  {item.name}{" "}
                  <span
                    className={cn(
                      "font-mono font-bold",
                      item.stock <= 0
                        ? "text-destructive"
                        : "text-amber-700 dark:text-amber-400"
                    )}
                  >
                    ({item.stock <= 0 ? "0 left" : `${item.stock} left`} · min{" "}
                    {item.lowStockThreshold})
                  </span>
                  {index < urgentPreview.length - 1 && ", "}
                </span>
              ))}
              {totalCount > urgentPreview.length && (
                <span className="text-muted-foreground">
                  {" "}
                  and {totalCount - urgentPreview.length} more item(s)
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-center shrink-0 pt-1 sm:pt-0">
          {onNavigateToReorder && (
            <button
              type="button"
              onClick={onNavigateToReorder}
              data-testid="banner-open-reorder-btn"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold shadow-2xs hover:bg-primary/90 transition-colors cursor-pointer"
            >
              <span>Reorder List ({totalCount})</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}

          {onViewLowStockTab && (
            <button
              type="button"
              onClick={onViewLowStockTab}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-2xs hover:bg-muted hover:border-primary/40 transition-colors cursor-pointer"
            >
              <span>Inspect Stock</span>
            </button>
          )}

          <Link
            href="/products"
            className="inline-flex items-center gap-1 rounded-lg border border-border/80 bg-muted/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            <span>Catalog</span>
            <ArrowUpRight className="h-3 w-3" />
          </Link>

          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss warning banner"
            title="Dismiss banner"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
