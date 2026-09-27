"use client";

import { useEffect, useRef, useState } from "react";
import { X, Printer, Download, Building2, Phone, Mail, MapPin, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { SupplierOrderGroup, ReorderSummary } from "@/lib/reorder";

interface SupplierOrderSheetModalProps {
  open: boolean;
  onClose: () => void;
  supplierGroups: SupplierOrderGroup[];
  summary: ReorderSummary;
  settings: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    currency?: string;
  } | null;
  targetMultiplier: number;
}

export function SupplierOrderSheetModal({
  open,
  onClose,
  supplierGroups,
  summary,
  settings,
  targetMultiplier,
}: SupplierOrderSheetModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [poSuffix] = useState(() => Math.floor(1000 + Math.random() * 9000));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [open, onClose]);

  if (!open) return null;

  const storeName = settings?.name || "Izah Store";
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const poNumber = `PO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${poSuffix}`;

  const handlePrint = () => {
    // Small delay ensures print styles apply cleanly
    setTimeout(() => {
      window.print();
    }, 50);
  };

  const handleExportCsv = () => {
    const headers = [
      "Supplier",
      "Product Name",
      "SKU",
      "Barcode",
      "Current Stock",
      "Threshold",
      "Suggested Order Qty",
      "Unit",
      "Unit Cost",
      "Total Estimated Cost",
    ];

    const rows: string[][] = [];
    for (const group of supplierGroups) {
      for (const item of group.items) {
        rows.push([
          `"${group.supplierName.replace(/"/g, '""')}"`,
          `"${item.name.replace(/"/g, '""')}"`,
          `"${item.sku ?? ""}"`,
          `"${item.barcode ?? ""}"`,
          String(item.stock),
          String(item.lowStockThreshold),
          String(item.suggestedQty),
          `"${item.unit}"`,
          (item.unitCost ?? 0).toFixed(2),
          (item.totalCost ?? 0).toFixed(2),
        ]);
      }
    }

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `supplier-order-sheet-${poNumber}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 print:p-0 print:bg-white print:fixed print:inset-0"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
        @media print {
          body > *:not(#supplier-order-sheet-print) { display: none !important; }
          #supplier-order-sheet-print {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 1.5cm !important;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
            color: black !important;
            font-size: 11pt !important;
          }
          .no-print { display: none !important; }
          .page-break-after { page-break-after: always; break-after: page; }
          .avoid-break { page-break-inside: avoid; break-inside: avoid; }
        }
      `}</style>

      <div
        id="supplier-order-sheet-print"
        ref={containerRef}
        className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-xl bg-card border shadow-2xl overflow-hidden print:max-h-none print:overflow-visible print:border-none print:rounded-none"
      >
        {/* Modal Controls Header (Hidden in Print) */}
        <div className="no-print flex items-center justify-between border-b px-5 py-3.5 bg-muted/40 shrink-0">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-bold text-sm sm:text-base text-foreground">
                Supplier Order Sheet &amp; Purchase Plan
              </h2>
              <p className="text-xs text-muted-foreground">
                Official restock order preview grouped by vendor
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              data-testid="export-reorder-csv-btn"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background hover:bg-muted px-3 py-1.5 text-xs font-medium text-foreground transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              data-testid="print-supplier-order-sheet-btn"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary hover:bg-primary/90 px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print / Save PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              data-testid="close-order-sheet-modal-btn"
              aria-label="Close"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Document Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 print:p-0 print:overflow-visible print:space-y-6 text-foreground">
          {/* Document Header */}
          <div className="border-b pb-5">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-black tracking-tight text-primary print:text-gray-900">
                    {storeName}
                  </span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 print:border-gray-400 print:text-gray-700">
                    Purchase Order Sheet
                  </span>
                </div>
                {settings?.address && <p className="text-xs text-muted-foreground mt-1">{settings.address}</p>}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                  {settings?.phone && <span>Tel: {settings.phone}</span>}
                  {settings?.email && <span>Email: {settings.email}</span>}
                </div>
              </div>

              <div className="text-left sm:text-right text-xs space-y-1 bg-muted/40 sm:bg-transparent p-3 sm:p-0 rounded-lg border sm:border-none print:border-none print:p-0">
                <p className="text-sm font-bold font-mono text-foreground print:text-gray-900">
                  {poNumber}
                </p>
                <p className="text-muted-foreground">
                  Date: <span className="font-medium text-foreground">{dateStr}</span> ({timeStr})
                </p>
                <p className="text-muted-foreground">
                  Restock Multiplier: <span className="font-semibold text-primary">{targetMultiplier}x Threshold</span>
                </p>
              </div>
            </div>
          </div>

          {/* KPI Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-lg border bg-muted/20 text-xs print:bg-gray-50 print:border-gray-300">
            <div>
              <p className="text-[11px] uppercase font-semibold text-muted-foreground">Items to Reorder</p>
              <p className="text-base font-bold text-foreground mt-0.5">{summary.totalLowStockCount} products</p>
            </div>
            <div>
              <p className="text-[11px] uppercase font-semibold text-muted-foreground">Out of Stock</p>
              <p className={`text-base font-bold mt-0.5 ${summary.outOfStockCount > 0 ? "text-destructive font-black" : "text-foreground"}`}>
                {summary.outOfStockCount} items
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase font-semibold text-muted-foreground">Total Units to Order</p>
              <p className="text-base font-bold text-primary print:text-gray-900 mt-0.5">
                {summary.totalSuggestedUnits} units
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase font-semibold text-muted-foreground">Est. Total Investment</p>
              <p className="text-base font-bold text-green-600 dark:text-green-400 print:text-gray-900 mt-0.5">
                {formatCurrency(summary.totalEstimatedCost)}
              </p>
            </div>
          </div>

          {/* Supplier Sections */}
          {supplierGroups.length === 0 ? (
            <div className="text-center py-12 border rounded-lg bg-muted/10 text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto text-green-500 mb-2 opacity-80" />
              <p className="font-semibold text-foreground">No Products Currently Require Reordering</p>
              <p className="text-xs mt-1">All inventory items are above their designated low-stock safety thresholds.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {supplierGroups.map((group, gIdx) => (
                <div
                  key={group.supplierId}
                  className="rounded-lg border bg-card overflow-hidden avoid-break print:border-gray-300"
                >
                  {/* Supplier Header Box */}
                  <div className="px-4 py-3 bg-muted/60 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 print:bg-gray-100 print:border-gray-300">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm sm:text-base text-foreground print:text-gray-900">
                          {gIdx + 1}. {group.supplierName}
                        </span>
                        {group.supplierId === "unassigned" && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 font-medium px-2 py-0.5 rounded">
                            Action Needed: Assign Supplier
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-0.5">
                        {group.contactPerson && (
                          <span>Contact: <strong className="text-foreground">{group.contactPerson}</strong></span>
                        )}
                        {group.phone && <span>Tel: {group.phone}</span>}
                        {group.email && <span>Email: {group.email}</span>}
                        {group.address && <span>Address: {group.address}</span>}
                      </div>
                    </div>

                    <div className="text-right sm:text-right text-xs shrink-0">
                      <span className="font-medium text-muted-foreground">Subtotal ({group.items.length} items): </span>
                      <span className="font-bold text-sm text-foreground print:text-gray-900">
                        {formatCurrency(group.totalEstimatedCost)}
                      </span>
                    </div>
                  </div>

                  {/* Supplier Items Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/30 border-b text-[11px] uppercase font-semibold text-muted-foreground print:bg-gray-50 print:border-gray-200">
                        <tr>
                          <th className="px-3 py-2 w-8">#</th>
                          <th className="px-3 py-2">Product Description</th>
                          <th className="px-3 py-2">SKU / Barcode</th>
                          <th className="px-3 py-2 text-right">Current Stock</th>
                          <th className="px-3 py-2 text-right">Threshold</th>
                          <th className="px-3 py-2 text-right font-bold text-primary print:text-gray-900">
                            Order Qty
                          </th>
                          <th className="px-3 py-2 text-right">Unit Cost</th>
                          <th className="px-3 py-2 text-right">Est. Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border print:divide-gray-200">
                        {group.items.map((item, itemIdx) => (
                          <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-3 py-2 text-muted-foreground">{itemIdx + 1}</td>
                            <td className="px-3 py-2 font-medium text-foreground">
                              {item.name}
                              {item.category && (
                                <span className="ml-2 text-[10px] text-muted-foreground">({item.category})</span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-mono text-muted-foreground">
                              {item.sku || item.barcode || "—"}
                            </td>
                            <td className="px-3 py-2 text-right font-mono">
                              <span
                                className={
                                  item.isOutOfStock
                                    ? "text-destructive font-bold"
                                    : item.stock <= item.lowStockThreshold
                                    ? "text-amber-600 dark:text-amber-400 font-semibold"
                                    : ""
                                }
                              >
                                {item.stock} {item.unit}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                              {item.lowStockThreshold} {item.unit}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-primary print:text-gray-900">
                              {item.suggestedQty} {item.unit}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                              {formatCurrency(item.unitCost)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-foreground">
                              {formatCurrency(item.totalCost)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t bg-muted/20 font-semibold text-xs print:bg-gray-50">
                        <tr>
                          <td colSpan={5} className="px-3 py-2 text-right text-muted-foreground">
                            Supplier Total:
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-primary print:text-gray-900">
                            {group.totalUnits} units
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground">Est. Cost:</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-foreground print:text-gray-900">
                            {formatCurrency(group.totalEstimatedCost)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Grand Total Order Sheet Summary */}
          {supplierGroups.length > 0 && (
            <div className="rounded-lg border bg-primary/5 p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 avoid-break print:border-gray-400 print:bg-gray-50">
              <div>
                <p className="text-xs uppercase font-bold text-primary tracking-wider print:text-gray-900">
                  Grand Total Purchase Order Estimate
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Across {summary.supplierCount} supplier(s) and {summary.totalLowStockCount} low-stock line items
                </p>
              </div>
              <div className="text-right">
                <p className="text-xl font-black font-mono text-primary print:text-gray-900">
                  {formatCurrency(summary.totalEstimatedCost)}
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  {summary.totalSuggestedUnits} total units to order
                </p>
              </div>
            </div>
          )}

          {/* Official Sign-Off Section */}
          <div className="pt-6 mt-4 border-t avoid-break print:border-gray-400">
            <div className="grid grid-cols-2 gap-8 text-xs text-foreground">
              <div>
                <p className="font-bold text-foreground mb-10 print:text-gray-900">
                  Order Prepared &amp; Verified By:
                </p>
                <div className="border-b border-muted-foreground/50 w-56 mb-1.5 print:border-gray-700" />
                <p className="text-[11px] text-muted-foreground">
                  Purchasing Officer / Store Custodian (Signature &amp; Date)
                </p>
              </div>
              <div>
                <p className="font-bold text-foreground mb-10 print:text-gray-900">
                  Audited &amp; Authorized Approval:
                </p>
                <div className="border-b border-muted-foreground/50 w-56 mb-1.5 print:border-gray-700" />
                <p className="text-[11px] text-muted-foreground">
                  Store Manager / Owner Approval (Signature &amp; Date)
                </p>
              </div>
            </div>

            <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-8 pt-2 border-t print:border-gray-300">
              <span>{storeName} — Official Supplier Order Sheet ({poNumber})</span>
              <span>Confidential Procurement &amp; Inventory Restock Plan</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
