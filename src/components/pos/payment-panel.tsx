"use client";

import { pendingCheckout, completeCheckout } from "@/lib/browser-session";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useCartStore, PaymentMethod } from "@/store/cart";
import { formatCurrency, cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import {
  PauseCircle,
  ClipboardList,
  SplitSquareHorizontal,
  X,
  Percent,
  Star,
  ChevronDown,
} from "lucide-react";

interface PaymentPanelProps {
  taxRate: number;
  onClear: () => void;
  /** Called with the new sale ID after a successful sale — triggers receipt */
  onSaleComplete?: (saleId: string, receiptReference: string) => void;
  /** Clears the cart after an offline sale has been durably queued. */
  onOfflineSaleQueued?: () => void;
  /** Open the held‑orders modal */
  onHoldOrders?: () => void;
  /** Optional customer to attach to the sale */
  customerId?: string | null;
}

const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "CARD", "OTHER"];

export function PaymentPanel({
  taxRate,
  onClear,
  onSaleComplete,
  onOfflineSaleQueued,
  onHoldOrders,
  customerId,
}: PaymentPanelProps) {
  const t = useTranslations("pos");
  const router = useRouter();
  const {
    items,
    paymentMethod,
    setPaymentMethod,
    amountTendered,
    setAmountTendered,
    paymentLines,
    setPaymentLine,
    removePaymentLine,
    clearPaymentLines,
    clearCart,
    isSplitMode,
    paymentLinesTotal,
    total,
    changeDue,
    taxRate: taxRateOverride,
    setTaxRate,
    loyaltyPointsUsed,
    setLoyaltyPointsUsed,
  } = useCartStore();

  const [loading, setLoading] = useState(false);

  const [holdLoading, setHoldLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);
  const [showTaxEdit, setShowTaxEdit] = useState(false);
  const [splitInput, setSplitInput] = useState<Record<PaymentMethod, string>>({
    CASH: "",
    CARD: "",
    OTHER: "",
  });

  // Dynamic company receipt series list
  const [receiptSeries, setReceiptSeries] = useState<
    Array<{ id: string; name: string; nextNumber: number }>
  >([]);
  const [receiptSeriesId, setReceiptSeriesId] = useState("");
  const [drSiNumber, setDrSiNumber] = useState("");

  // Load active company receipt series from API
  useEffect(() => {
    fetch("/api/receipt-series")
      .then((response) => response.json())
      .then((data) => {
        const active: Array<{ id: string; name: string; nextNumber: number }> = data.series ?? [];
        setReceiptSeries(active);

        // Auto-select: prioritize current selection, then 211, then CHB, then first active
        setReceiptSeriesId((currentId) => {
          if (currentId && active.some((s) => s.id === currentId)) {
            return currentId;
          }
          const pref211 = active.find((s) => s.name.toUpperCase() === "211");
          if (pref211) return pref211.id;
          const prefCHB = active.find((s) => s.name.toUpperCase() === "CHB");
          if (prefCHB) return prefCHB.id;
          return active[0]?.id ?? "";
        });

        try {
          window.localStorage.setItem("izah-pos-receipt-series", JSON.stringify(active));
        } catch {
          // Local storage best-effort
        }
      })
      .catch(() => {
        try {
          const cached = JSON.parse(
            window.localStorage.getItem("izah-pos-receipt-series") ?? "[]"
          ) as Array<{ id: string; name: string; nextNumber: number }>;
          setReceiptSeries(cached);
          setReceiptSeriesId((currentId) => {
            if (currentId && cached.some((s) => s.id === currentId)) return currentId;
            const pref211 = cached.find((s) => s.name.toUpperCase() === "211");
            if (pref211) return pref211.id;
            return cached[0]?.id ?? "";
          });
        } catch {
          setReceiptSeries([]);
        }
      });
  }, []);

  // Loyalty state
  const [loyaltyInfo, setLoyaltyInfo] = useState<{
    points: number;
    enabled: boolean;
    earnRate: number;
    redeemValue: number;
    maxRedeemDiscount: number;
  } | null>(null);

  useEffect(() => {
    if (!customerId) {
      setLoyaltyInfo(null);
      setLoyaltyPointsUsed(0);
      return;
    }
    fetch(`/api/loyalty?customerId=${customerId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.enabled) setLoyaltyInfo(d);
        else {
          setLoyaltyInfo(null);
          setLoyaltyPointsUsed(0);
        }
      })
      .catch(() => {
        setLoyaltyInfo(null);
      });
  }, [customerId, setLoyaltyPointsUsed]);

  // Loyalty discount in currency units
  const loyaltyDiscount =
    loyaltyInfo && loyaltyPointsUsed > 0
      ? Math.min(loyaltyPointsUsed / loyaltyInfo.redeemValue, loyaltyInfo.maxRedeemDiscount)
      : 0;

  const tot = total(taxRate);
  const change = changeDue(taxRate);
  const isEmpty = items.length === 0;
  const splitMode = isSplitMode();
  const splitPaid = paymentLinesTotal();
  const splitRemaining = Math.max(0, tot - splitPaid);
  const effectiveTaxRate = taxRateOverride !== null ? taxRateOverride : taxRate;

  const activeSeries = receiptSeries.find((s) => s.id === receiptSeriesId) || receiptSeries[0];

  function handleSplitInput(method: PaymentMethod, val: string) {
    setSplitInput((prev) => ({ ...prev, [method]: val }));
    const n = parseFloat(val);
    if (!isNaN(n) && n > 0) setPaymentLine({ method, amount: n });
    else removePaymentLine(method);
  }

  async function handleCompleteSale() {
    if (isEmpty) return;

    const targetSeries =
      receiptSeries.find((s) => s.id === receiptSeriesId) ||
      receiptSeries.find((s) => s.name.toUpperCase() === "211") ||
      receiptSeries.find((s) => s.name.toUpperCase() === "CHB") ||
      receiptSeries[0];

    const effectiveId = targetSeries?.id;

    if (!effectiveId) {
      setError("Please select a company receipt before completing checkout.");
      return;
    }

    setError(null);
    setQueuedMessage(null);
    setLoading(true);

    const { items: cartItems, discountAmount, discountType, note } = useCartStore.getState();

    try {
      const body: Record<string, unknown> = {
        receiptSeriesId: effectiveId,
        drSiNumber: drSiNumber.trim() || undefined,
        items: cartItems.map((i) => ({
          productId: i.productId,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          notes: i.notes || undefined,
          packagingId: i.packagingId,
        })),
        taxRate: effectiveTaxRate,
        discountAmount,
        discountType,
        tipAmount: 0,
        note: note || undefined,
        customerId: customerId || undefined,
        loyaltyPointsUsed: loyaltyPointsUsed || 0,
      };

      if (splitMode && paymentLines.length > 0) {
        body.paymentLines = paymentLines;
      } else {
        body.paymentMethod = paymentMethod;
        if (paymentMethod === "CASH") body.amountTendered = amountTendered || tot;
      }

      const ownerUserId = localStorage.getItem("izah_user_id");
      if (!ownerUserId) throw new Error("Sign in again before completing a sale.");
      body.originatingUserId = ownerUserId;
      body.clientRequestId = pendingCheckout(ownerUserId, body).id;
      let res: Response;
      const token = typeof window !== "undefined" ? localStorage.getItem("izah_session_token") : null;
      const reqHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        reqHeaders["Authorization"] = `Bearer ${token}`;
        reqHeaders["x-session-token"] = token;
      }
      try {
        res = await fetch("/api/sales", {
          method: "POST",
          headers: reqHeaders,
          body: JSON.stringify(body),
        });
      } catch (networkError) {
        const offline = typeof navigator !== "undefined" && !navigator.onLine;
        if (!offline && !(networkError instanceof TypeError)) throw networkError;
        const { enqueueOfflineWrite } = await import("@/lib/pglite");
        await enqueueOfflineWrite("/api/sales", "POST", body);
        completeCheckout(ownerUserId);
        onOfflineSaleQueued?.();
        setQueuedMessage("Offline — sale saved and will sync when the connection returns.");
        return;
      }

      if (!res.ok) {
        const resp = await res.json();
        throw new Error(resp.error ?? "Failed to complete sale");
      }

      const resp = await res.json();
      completeCheckout(ownerUserId);
      const saleId: string = resp.sale?.id ?? "";

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("pos:stock-changed", {
            detail: { lowStockAlerts: resp.lowStockAlerts ?? [] },
          })
        );
      }

      if (onSaleComplete) {
        const selected = receiptSeries.find((series) => series.id === effectiveId);
        const number = Number(resp.sale?.receiptNumber ?? 0);
        const seriesPrefix = selected?.name || targetSeries?.name || "Receipt";
        onSaleComplete(saleId, `${seriesPrefix}-${String(number).padStart(6, "0")}`);
      } else {
        onClear();
      }
      setDrSiNumber("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleHoldOrder() {
    if (isEmpty) return;
    setHoldLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("izah_session_token") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
        headers["x-session-token"] = token;
      }
      const payload = JSON.stringify({
        cartSnapshot: { items, paymentMethod, amountTendered },
        label: `Hold ${new Date().toLocaleTimeString()}`,
      });
      let res = await fetch("/api/held-orders", {
        method: "POST",
        headers,
        body: payload,
      });
      if (!res.ok) {
        res = await fetch("/api/held-orders", {
          method: "POST",
          headers,
          body: payload,
        });
      }
      if (res.ok) {
        clearCart();
      }
    } finally {
      setHoldLoading(false);
    }
  }

  return (
    <div className="space-y-3 border-t p-4">
      {/* Company Receipt Dropdown Selection (e.g., 211, CHB) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor="company-receipt-dropdown"
            className="text-muted-foreground text-xs font-semibold uppercase tracking-wider"
          >
            Company Receipt
          </label>
          {activeSeries && (
            <span className="font-mono text-xs text-muted-foreground">
              Next: #{String(activeSeries.nextNumber).padStart(6, "0")}
            </span>
          )}
        </div>

        <div className="relative">
          <select
            id="company-receipt-dropdown"
            data-testid="company-receipt-select"
            value={receiptSeriesId}
            onChange={(e) => setReceiptSeriesId(e.target.value)}
            className="bg-background text-foreground h-9 w-full appearance-none rounded-md border border-input px-3 pr-8 text-xs font-semibold tracking-wide shadow-xs focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
          >
            {receiptSeries.length === 0 ? (
              <option value="">Loading company receipts…</option>
            ) : (
              receiptSeries.map((series) => (
                <option key={series.id} value={series.id}>
                  {series.name} (Next #{String(series.nextNumber).padStart(6, "0")})
                </option>
              ))
            )}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-muted-foreground">
            <ChevronDown className="h-4 w-4" />
          </div>
        </div>

        <div>
          <input
            id="dr-si-no"
            type="text"
            value={drSiNumber}
            onChange={(e) => setDrSiNumber(e.target.value)}
            placeholder="DR / SI No. (optional)"
            className="bg-background h-8 w-full rounded-md border border-input px-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Hold / Recall row */}
      <div className="flex gap-2">
        <button
          onClick={handleHoldOrder}
          disabled={isEmpty || holdLoading}
          className="text-muted-foreground hover:bg-accent flex flex-1 items-center justify-center gap-1 rounded-md border py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50"
        >
          <PauseCircle className="h-3.5 w-3.5" />
          {holdLoading ? "..." : t("hold")}
        </button>
        <button
          onClick={onHoldOrders}
          className="text-muted-foreground hover:bg-accent flex flex-1 items-center justify-center gap-1 rounded-md border py-1.5 text-xs font-medium transition-colors"
        >
          <ClipboardList className="h-3.5 w-3.5" />
          Recall
        </button>
      </div>

      {/* Tax override option (compact) */}
      {!isEmpty && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={taxRateOverride === 0}
              onChange={(e) => {
                if (e.target.checked) {
                  setTaxRate(0);
                  setShowTaxEdit(false);
                } else {
                  setTaxRate(null);
                }
              }}
              className="accent-primary h-3 w-3"
            />
            Tax Exempt
          </label>
          <div className="relative">
            <button
              onClick={() => setShowTaxEdit((v) => !v)}
              className="hover:text-primary flex items-center gap-1 transition-colors"
            >
              <Percent className="h-3 w-3" />
              {taxRateOverride !== null
                ? `${(taxRateOverride * 100).toFixed(0)}% (custom)`
                : `${(taxRate * 100).toFixed(0)}% (default)`}
            </button>
            {showTaxEdit && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowTaxEdit(false)} />
                <div className="border-border bg-popover ring-border/10 animate-in fade-in zoom-in-95 absolute right-0 bottom-full z-50 mb-2 w-48 rounded-lg border p-2.5 shadow-xl ring-1">
                  <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b">
                    <p className="text-foreground text-xs font-semibold">Custom Tax Rate</p>
                    <button
                      onClick={() => setShowTaxEdit(false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      placeholder={(taxRate * 100).toString()}
                      className="bg-background w-full rounded-md border px-2 py-1 text-xs"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const val = parseFloat(e.currentTarget.value);
                          if (!isNaN(val)) {
                            setTaxRate(val / 100);
                            setShowTaxEdit(false);
                          }
                        }
                      }}
                    />
                    <button
                      onClick={(e) => {
                        const input = e.currentTarget.parentElement?.querySelector("input");
                        if (input) {
                          const val = parseFloat(input.value);
                          if (!isNaN(val)) {
                            setTaxRate(val / 100);
                            setShowTaxEdit(false);
                          }
                        }
                      }}
                      className="bg-primary text-primary-foreground rounded-md px-2 py-1 text-xs font-medium"
                    >
                      Set
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Loyalty Points Redemption (if available) */}
      {loyaltyInfo && loyaltyInfo.points > 0 && !isEmpty && (
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 font-medium text-yellow-600 dark:text-yellow-400">
              <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
              Loyalty Points
            </span>
            <span className="font-mono text-muted-foreground">
              {loyaltyInfo.points} pts available
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={loyaltyInfo.points}
              step={loyaltyInfo.redeemValue}
              value={loyaltyPointsUsed || ""}
              onChange={(e) => setLoyaltyPointsUsed(parseInt(e.target.value) || 0)}
              placeholder="Points to redeem"
              className="bg-background focus:ring-ring flex-1 rounded-md border px-2 py-1 text-xs focus:ring-2 focus:outline-none"
            />
            {loyaltyPointsUsed > 0 && (
              <span className="text-xs font-medium text-green-600">
                -{formatCurrency(loyaltyDiscount)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Payment Method / Split Toggle */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Payment
          </span>
          <button
            onClick={() => {
              if (splitMode) {
                clearPaymentLines();
                setSplitInput({ CASH: "", CARD: "", OTHER: "" });
              } else {
                setPaymentLine({ method: paymentMethod, amount: tot });
                setSplitInput((prev) => ({ ...prev, [paymentMethod]: String(tot.toFixed(2)) }));
              }
            }}
            className="text-muted-foreground hover:text-primary flex items-center gap-1 text-xs transition-colors cursor-pointer"
          >
            <SplitSquareHorizontal className="h-3.5 w-3.5" />
            {splitMode ? "Single" : "Split"}
          </button>
        </div>

        {splitMode ? (
          /* Split tender */
          <div className="space-y-2">
            {PAYMENT_METHODS.map((method) => {
              const line = paymentLines.find((p) => p.method === method);
              return (
                <div key={method} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "w-16 rounded-md border py-1.5 text-center text-xs font-medium",
                      line ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
                    )}
                  >
                    {method}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={splitInput[method]}
                    onChange={(e) => handleSplitInput(method, e.target.value)}
                    placeholder="0.00"
                    data-testid={`split-input-${method.toLowerCase()}`}
                    className="bg-background focus:ring-ring flex-1 rounded-md border px-2 py-1.5 text-xs focus:ring-2 focus:outline-none"
                  />
                  {line && (
                    <button
                      onClick={() => {
                        removePaymentLine(method);
                        setSplitInput((prev) => ({ ...prev, [method]: "" }));
                      }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
            <div className="flex justify-between pt-1 text-xs">
              <span className="text-muted-foreground">
                Remaining:{" "}
                <span
                  className={
                    splitRemaining > 0
                      ? "text-destructive font-semibold"
                      : "font-semibold text-green-600"
                  }
                >
                  {formatCurrency(splitRemaining)}
                </span>
              </span>
              {change > 0 && (
                <span className="font-medium text-green-600">Change: {formatCurrency(change)}</span>
              )}
            </div>
          </div>
        ) : (
          /* Single method */
          <>
            <div className="flex gap-2">
              {PAYMENT_METHODS.map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={cn(
                    "flex-1 rounded-md border py-2 text-xs font-semibold transition-colors cursor-pointer",
                    paymentMethod === method
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent border-border"
                  )}
                >
                  {method}
                </button>
              ))}
            </div>

            {paymentMethod === "CASH" && (
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-muted-foreground font-medium">Amount Tendered</label>
                  {change > 0 && (
                    <span className="font-mono font-bold text-green-600">
                      Change: {formatCurrency(change)}
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={amountTendered || ""}
                  onChange={(e) => setAmountTendered(parseFloat(e.target.value) || 0)}
                  placeholder={formatCurrency(tot)}
                  data-testid="tendered-input"
                  className="border-input bg-background focus:ring-ring flex h-9 w-full rounded-md border px-3 py-1.5 text-sm font-mono outline-none focus:ring-2"
                />
              </div>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/25 bg-destructive/10 p-2.5 text-xs text-destructive">
          <p>{error}</p>
        </div>
      )}
      {queuedMessage && <p className="text-xs text-green-600">{queuedMessage}</p>}

      {/* Complete Sale Button */}
      <button
        data-charge-btn
        onClick={handleCompleteSale}
        disabled={isEmpty || loading || (splitMode && splitRemaining > 0.005)}
        className="bg-primary text-primary-foreground hover:bg-primary/90 w-full rounded-lg py-3 text-sm font-bold tracking-wide transition-colors disabled:pointer-events-none disabled:opacity-50 cursor-pointer shadow-sm"
      >
        {loading ? "Processing…" : `${t("checkout")} ${formatCurrency(tot)}`}
      </button>

      {/* Void / Clear Cart Button */}
      {!isEmpty && (
        <button
          onClick={onClear}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive w-full rounded-md border py-1.5 text-xs font-medium transition-colors cursor-pointer"
        >
          {t("void")}
        </button>
      )}
    </div>
  );
}
