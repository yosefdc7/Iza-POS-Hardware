"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp, TrendingDown, X, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeStockBreakdown } from "@/lib/hardware-units";

type StockAdjReason = "RECEIVED" | "DAMAGED" | "THEFT" | "CORRECTION" | "OPENING_COUNT";

const REASONS: { value: StockAdjReason; label: string; sign: 1 | -1 }[] = [
  { value: "RECEIVED", label: "Stock Received", sign: 1 },
  { value: "CORRECTION", label: "Manual Correction", sign: 1 },
  { value: "OPENING_COUNT", label: "Opening Count", sign: 1 },
  { value: "DAMAGED", label: "Damaged / Expired", sign: -1 },
  { value: "THEFT", label: "Theft / Loss", sign: -1 },
];

export interface PackagingOption {
  id: string;
  name: string;
  conversionQty: number | { toString(): string };
}

interface StockAdjustModalProps {
  productId: string;
  productName: string;
  currentStock: number;
  unit?: string;
  packagings?: PackagingOption[];
  onClose: () => void;
  isStaff?: boolean;
}

export function StockAdjustModal({
  productId,
  productName,
  currentStock,
  unit = "pc",
  packagings = [],
  onClose,
  isStaff = false,
}: StockAdjustModalProps) {
  const router = useRouter();
  const [reason, setReason] = useState<StockAdjReason>("RECEIVED");
  const [selectedPackId, setSelectedPackId] = useState<string>("base");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedReason = REASONS.find((r) => r.value === reason)!;
  const activePack = packagings.find((p) => p.id === selectedPackId);
  const conversionMultiplier = activePack ? Number(activePack.conversionQty) : 1;

  const inputQuantity = parseFloat(qty) || 0;
  const effectiveBaseUnits = inputQuantity * conversionMultiplier;
  const delta = selectedReason.sign * effectiveBaseUnits;
  const newStock = currentStock + delta;

  // Breakdown of stock into boxes + pieces
  const currentBreakdown = computeStockBreakdown(currentStock, unit, packagings);
  const newBreakdown = computeStockBreakdown(newStock, unit, packagings);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inputQuantity || inputQuantity <= 0) {
      setError("Quantity must be a positive number");
      return;
    }
    if (newStock < 0) {
      setError("Stock adjustment would result in negative inventory");
      return;
    }

    setSaving(true);
    setError(null);

    const packNote = activePack
      ? `${inputQuantity} ${activePack.name}${inputQuantity > 1 ? "s" : ""} (${effectiveBaseUnits} ${unit}s)`
      : "";
    const finalNote = note.trim()
      ? packNote
        ? `${note.trim()} [${packNote}]`
        : note.trim()
      : packNote;

    try {
      const res = await fetch("/api/stock-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          delta,
          quantity: delta,
          reason,
          note: finalNote || undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to save adjustment");
      }

      const d = await res.json();
      if (d.pending) {
        window.alert("Stock change submitted for admin approval");
        router.refresh();
        onClose();
        return;
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("pos:stock-changed", {
            detail: { lowStockAlerts: d.lowStockAlerts ?? [] },
          })
        );
      }
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to adjust stock");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-semibold">{isStaff ? "Request stock adjustment" : "Adjust Stock"}</h2>
            <p className="text-xs text-muted-foreground">{productName}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          {/* Current stock display */}
          <div className="rounded-lg bg-muted/50 px-4 py-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Current Inventory</p>
            <p className="text-2xl font-bold">
              {currentStock} <span className="text-sm font-normal text-muted-foreground">{unit}s</span>
            </p>
            {currentBreakdown && (
              <p className="text-xs text-primary font-medium mt-0.5">
                ({currentBreakdown.formattedText})
              </p>
            )}
          </div>

          {/* Unit selector (Base unit vs Box/Packaging) */}
          {packagings.length > 0 && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted-foreground">
                Stocking / Adjusting Unit
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedPackId("base")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium border transition-colors",
                    selectedPackId === "base"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted text-muted-foreground"
                  )}
                >
                  Individual ({unit})
                </button>
                {packagings.map((pkg) => (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => setSelectedPackId(pkg.id)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium border transition-colors",
                      selectedPackId === pkg.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted text-muted-foreground"
                    )}
                  >
                    <Package className="h-3.5 w-3.5" />
                    {pkg.name} ({Number(pkg.conversionQty)} {unit}s)
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Reason */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as StockAdjReason)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Quantity */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">
              Quantity {activePack ? `in ${activePack.name}s` : `in ${unit}s`}
            </label>
            <input
              type="number"
              step="any"
              min="0.0001"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={activePack ? `e.g. 5 ${activePack.name}s` : "e.g. 10"}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-semibold"
              required
            />
          </div>

          {/* Conversion Math Preview */}
          {inputQuantity > 0 && (
            <div
              className={cn(
                "rounded-lg p-3 text-sm border space-y-1",
                delta > 0
                  ? "bg-green-50/80 border-green-200 text-green-800 dark:bg-green-950/40 dark:border-green-800 dark:text-green-300"
                  : "bg-red-50/80 border-red-200 text-red-800 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300"
              )}
            >
              <div className="flex items-center justify-between font-medium">
                <span className="flex items-center gap-1.5">
                  {delta > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {delta > 0 ? "Adding" : "Deducting"}{" "}
                  {activePack
                    ? `${inputQuantity} ${activePack.name}${inputQuantity > 1 ? "s" : ""}`
                    : `${inputQuantity} ${unit}s`}
                </span>
                <span className="font-bold">
                  {delta > 0 ? "+" : ""}
                  {delta} {unit}s
                </span>
              </div>

              {activePack && (
                <p className="text-xs opacity-85">
                  Calculation: {inputQuantity} {activePack.name}s × {conversionMultiplier} {unit}s = {effectiveBaseUnits} {unit}s
                </p>
              )}

              <div className="text-xs pt-1 border-t border-current/20 flex justify-between">
                <span>New inventory:</span>
                <span className="font-semibold">
                  {newStock} {unit}s {newBreakdown ? `(${newBreakdown.formattedText})` : ""}
                </span>
              </div>
            </div>
          )}

          {/* Note */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">
              Note <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Supplier Invoice #5432"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border px-4 py-2 text-sm hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !qty || inputQuantity <= 0}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {saving ? "Saving…" : "Apply Adjustment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
