"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Package,
  Printer,
  Download,
  Search,
  Filter,
  RefreshCw,
  Building2,
  ExternalLink,
  Edit,
  ArrowUpDown,
  Sparkles,
  SlidersHorizontal,
  CheckCircle2,
  Layers,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { groupReorderItemsBySupplier, type ReorderProduct, type SupplierOrderGroup, type ReorderSummary } from "@/lib/reorder";
import { SupplierOrderSheetModal } from "./supplier-order-sheet-modal";

interface ReorderApiPayload {
  products: ReorderProduct[];
  supplierGroups: SupplierOrderGroup[];
  summary: ReorderSummary;
  suppliers: Array<{ id: string; name: string }>;
  settings: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    currency?: string;
  } | null;
}

export function ReorderListTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ReorderProduct[]>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [settings, setSettings] = useState<ReorderApiPayload["settings"]>(null);

  // Filters & Controls
  const [search, setSearch] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("all");
  const [multiplier, setMultiplier] = useState<number>(1);
  const [customQtyOverrides, setCustomQtyOverrides] = useState<Record<string, number>>({});
  const [isSheetModalOpen, setIsSheetModalOpen] = useState(false);

  // Fetch from API
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("multiplier", String(multiplier));
      if (selectedSupplierId !== "all") params.set("supplierId", selectedSupplierId);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/reorder?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load reorder list");
      const data: ReorderApiPayload = await res.json();

      setProducts(data.products || []);
      setSuppliers(data.suppliers || []);
      setSettings(data.settings || null);
    } catch (err: any) {
      setError(err?.message || "Error loading reorder data");
    } finally {
      setLoading(false);
    }
  }, [multiplier, selectedSupplierId, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Recalculate groups & summary whenever customQtyOverrides or products change
  const { groups: calculatedGroups, summary: calculatedSummary } = useMemo(() => {
    return groupReorderItemsBySupplier(products, multiplier, customQtyOverrides);
  }, [products, multiplier, customQtyOverrides]);

  const handleQtyChange = (productId: string, val: string) => {
    const num = parseInt(val, 10);
    setCustomQtyOverrides((prev) => ({
      ...prev,
      [productId]: isNaN(num) ? 0 : Math.max(0, num),
    }));
  };

  const handleResetOverrides = () => {
    setCustomQtyOverrides({});
  };

  return (
    <div className="space-y-6" data-testid="reorder-list-view">
      {/* Top Banner & Title Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Inventory Reorder List
            </h2>
            <span className="text-xs bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300 font-semibold px-2.5 py-0.5 rounded-full border border-amber-300/40">
              {calculatedSummary.totalLowStockCount} items need restock
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Auto-populated with products at or below safety stock threshold. Export customized supplier purchase orders in one click.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fetchData}
            title="Refresh reorder list"
            data-testid="refresh-reorder-btn"
            className="inline-flex items-center gap-1.5 border border-border bg-background hover:bg-muted text-foreground px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer shadow-2xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSheetModalOpen(true)}
            disabled={products.length === 0}
            data-testid="export-supplier-pdf-btn"
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
          >
            <Printer className="h-4 w-4" />
            <span>Export Supplier Order Sheet (PDF)</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider">Low Stock Items</span>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-foreground">{calculatedSummary.totalLowStockCount}</p>
          <p className="text-[11px] text-muted-foreground">
            {calculatedSummary.outOfStockCount > 0 ? (
              <span className="text-destructive font-semibold">
                {calculatedSummary.outOfStockCount} completely out of stock
              </span>
            ) : (
              "All low stock items have remaining inventory"
            )}
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider">Suggested Order Units</span>
            <Layers className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-black text-primary">{calculatedSummary.totalSuggestedUnits}</p>
          <p className="text-[11px] text-muted-foreground">
            Target safety stock: <strong className="text-foreground">{multiplier}x</strong> threshold
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider">Est. Reorder Cost</span>
            <Sparkles className="h-4 w-4 text-green-500" />
          </div>
          <p className="text-2xl font-black text-green-600 dark:text-green-400">
            {formatCurrency(calculatedSummary.totalEstimatedCost)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Based on product unit purchase cost
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider">Target Suppliers</span>
            <Building2 className="h-4 w-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-black text-foreground">{calculatedSummary.supplierCount}</p>
          <p className="text-[11px] text-muted-foreground">
            {calculatedGroups.some((g) => g.supplierId === "unassigned")
              ? "Includes items needing supplier assignment"
              : "All items linked to registered suppliers"}
          </p>
        </div>
      </div>

      {/* Control Filters Bar */}
      <div className="rounded-xl border bg-card p-4 space-y-3 shadow-2xs">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product name, SKU, barcode, category..."
              data-testid="reorder-search-input"
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
            />
          </div>

          {/* Supplier Dropdown */}
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              data-testid="reorder-supplier-filter"
              className="bg-background text-foreground text-xs border border-input rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
            >
              <option value="all">All Suppliers ({suppliers.length + 1})</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="unassigned">Unassigned (No Supplier)</option>
            </select>
          </div>

          {/* Target Multiplier Chips */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground font-medium mr-1 text-[11px] uppercase tracking-wider flex items-center gap-1">
              <SlidersHorizontal className="h-3 w-3" /> Multiplier:
            </span>
            {[
              { label: "1x (Safety)", val: 1 },
              { label: "1.5x", val: 1.5 },
              { label: "2x (Standard)", val: 2 },
              { label: "3x (Bulk)", val: 3 },
            ].map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setMultiplier(opt.val)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer border ${
                  multiplier === opt.val
                    ? "bg-primary text-primary-foreground border-primary shadow-2xs"
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {Object.keys(customQtyOverrides).length > 0 && (
          <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
            <span>
              You have modified <strong>{Object.keys(customQtyOverrides).length}</strong> order quantities manually.
            </span>
            <button
              type="button"
              onClick={handleResetOverrides}
              className="text-primary hover:underline font-medium cursor-pointer"
            >
              Reset to calculated quantities
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area: Reorder List Grouped by Supplier */}
      {loading ? (
        <div className="py-20 text-center text-muted-foreground border rounded-xl bg-card">
          <RefreshCw className="h-8 w-8 mx-auto animate-spin mb-2 opacity-50" />
          <p className="text-sm font-medium">Scanning inventory for low-stock products...</p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm text-center">
          <p className="font-semibold">Error Loading Reorder List</p>
          <p className="text-xs mt-1">{error}</p>
          <button
            onClick={fetchData}
            className="mt-3 px-3 py-1 text-xs font-semibold bg-destructive text-destructive-foreground rounded-md"
          >
            Retry
          </button>
        </div>
      ) : calculatedGroups.length === 0 ? (
        <div className="py-16 text-center border rounded-xl bg-card text-muted-foreground space-y-2">
          <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 opacity-80" />
          <h3 className="text-base font-bold text-foreground">All Stock Levels Healthy</h3>
          <p className="text-xs max-w-md mx-auto">
            No products match the low-stock criteria with current search or supplier filters.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {calculatedGroups.map((group, gIdx) => (
            <div
              key={group.supplierId}
              className="rounded-xl border bg-card shadow-2xs overflow-hidden"
              data-testid={`supplier-reorder-group-${group.supplierId}`}
            >
              {/* Group Header */}
              <div className="px-4 py-3 bg-muted/40 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                    {gIdx + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-foreground">{group.supplierName}</h3>
                      {group.supplierId === "unassigned" ? (
                        <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 font-semibold px-2 py-0.5 rounded">
                          Unassigned
                        </span>
                      ) : (
                        <Link
                          href={`/suppliers`}
                          className="text-[10px] text-muted-foreground hover:text-primary inline-flex items-center gap-0.5"
                        >
                          View Vendor <ExternalLink className="h-2.5 w-2.5" />
                        </Link>
                      )}
                    </div>
                    {(group.phone || group.email || group.contactPerson) && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {group.contactPerson && <span>Attn: {group.contactPerson} • </span>}
                        {group.phone && <span>Tel: {group.phone} • </span>}
                        {group.email && <span>Email: {group.email}</span>}
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-right text-xs">
                  <span className="text-muted-foreground font-medium">Subtotal ({group.items.length} items): </span>
                  <span className="font-bold font-mono text-sm text-foreground">
                    {formatCurrency(group.totalEstimatedCost)}
                  </span>
                  <span className="ml-1 text-[11px] text-muted-foreground">({group.totalUnits} units)</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/20 border-b text-[11px] uppercase font-semibold text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5">Product</th>
                      <th className="px-4 py-2.5">SKU / Code</th>
                      <th className="px-4 py-2.5 text-right">Current Stock</th>
                      <th className="px-4 py-2.5 text-right">Threshold</th>
                      <th className="px-4 py-2.5 text-center font-bold text-primary w-36">
                        Order Qty
                      </th>
                      <th className="px-4 py-2.5 text-right">Unit Cost</th>
                      <th className="px-4 py-2.5 text-right">Est. Total</th>
                      <th className="px-4 py-2.5 text-center w-16">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {group.items.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <Link
                            href={`/products/${item.id}`}
                            className="font-semibold text-foreground hover:text-primary transition-colors flex items-center gap-1.5"
                          >
                            <span>{item.name}</span>
                          </Link>
                          {item.category && (
                            <span className="text-[10px] text-muted-foreground">{item.category}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          {item.sku || item.barcode || "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          <span
                            className={
                              item.isOutOfStock
                                ? "text-destructive font-bold bg-destructive/10 px-1.5 py-0.5 rounded text-[11px]"
                                : "text-amber-600 dark:text-amber-400 font-semibold"
                            }
                          >
                            {item.stock} {item.unit}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                          {item.lowStockThreshold} {item.unit}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              value={item.suggestedQty}
                              onChange={(e) => handleQtyChange(item.id, e.target.value)}
                              data-testid={`reorder-qty-input-${item.id}`}
                              className="w-20 px-2 py-1 text-center font-mono font-bold text-xs bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            <span className="text-[11px] text-muted-foreground">{item.unit}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                          {formatCurrency(item.unitCost)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-foreground">
                          {formatCurrency(item.totalCost)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Link
                            href={`/products/${item.id}`}
                            title="Open product details"
                            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted inline-flex items-center"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/10 font-semibold text-xs border-t">
                    <tr>
                      <td colSpan={4} className="px-4 py-2.5 text-right text-muted-foreground">
                        Vendor Subtotal:
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono font-bold text-primary">
                        {group.totalUnits} units
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">Total:</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-foreground">
                        {formatCurrency(group.totalEstimatedCost)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Supplier Order Sheet PDF Modal */}
      <SupplierOrderSheetModal
        open={isSheetModalOpen}
        onClose={() => setIsSheetModalOpen(false)}
        supplierGroups={calculatedGroups}
        summary={calculatedSummary}
        settings={settings}
        targetMultiplier={multiplier}
      />
    </div>
  );
}
