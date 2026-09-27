"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useCartStore } from "@/store/cart";
import { formatCurrency, cn } from "@/lib/utils";
import {
  Minus,
  Plus,
  Trash2,
  ClipboardList,
  MessageSquarePlus,
  ShoppingBag,
  Receipt,
  Lock,
} from "lucide-react";
import { ProductSearch } from "./product-search";
import { PaymentPanel } from "./payment-panel";
import { CustomerCapture, type CustomerSummary } from "./customer-capture";
import { HeldOrdersModal } from "./held-orders-modal";
import { VoidItemModal } from "./void-item-modal";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { NumericKeypad } from "@/components/ui/numeric-keypad";
import { ReceiptModal } from "@/components/receipt/receipt-modal";
import { KeyboardShortcutsModal } from "./keyboard-shortcuts-modal";
import { PosLockOverlay } from "./pos-lock-overlay";
import { usePosKeyboardShortcuts } from "@/hooks/use-pos-keyboard-shortcuts";
import { usePosAutoLock } from "@/hooks/use-pos-auto-lock";
import type { ReceiptData, ReceiptSettings } from "@/components/receipt/receipt";

const DEFAULT_TAX_RATE = 0;

const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  name: "My Shop",
  logoUrl: null,
  currency: "₱",
  currencyDecimals: 2,
  taxName: "Tax",
  receiptFooter: "Thank you for your business!",
};

export function POSScreen() {
  const t = useTranslations("pos");
  const tp = useTranslations("products");
  const [taxRate] = useState(DEFAULT_TAX_RATE);
  const [showHeldOrders, setShowHeldOrders] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [voidTargetId, setVoidTargetId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"search" | "cart">("search");
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [keypad, setKeypad] = useState<{ open: boolean; itemId: string; value: string }>({
    open: false,
    itemId: "",
    value: "1",
  });
  const prevItemsLenRef = useRef(0);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [autoLockMinutes, setAutoLockMinutes] = useState(0);

  useEffect(() => {
    setIsClient(true);
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.posAutoLockMinutes === "number") {
          setAutoLockMinutes(data.posAutoLockMinutes);
        }
      })
      .catch(() => {});
  }, []);

  const handleLock = useCallback(() => {
    setIsLocked(true);
  }, []);

  usePosAutoLock({
    autoLockMinutes,
    isLocked,
    onLock: handleLock,
  });

  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }, []);

  const focusSearch = useCallback(() => {
    const el = document.getElementById("pos-search-input") as HTMLInputElement | null;
    el?.focus();
    el?.select();
  }, []);

  usePosKeyboardShortcuts({
    onFocusSearch: focusSearch,
    onOpenPayment: () => {
      const btn = document.querySelector<HTMLButtonElement>("[data-charge-btn]");
      btn?.focus();
    },
    onHoldOrders: () => setShowHeldOrders(true),
    onLockTerminal: () => setIsLocked(true),
    onShowHelp: () => setShowShortcuts((v) => !v),
    onEscape: () => {
      setShowShortcuts(false);
      setShowHeldOrders(false);
    },
  });

  const {
    items,
    removeItem,
    updateQuantity,
    updateItemNotes,
    subtotal,
    discountValue,
    taxAmount,
    total,
    clearCart,
    amountTendered,
    paymentMethod,
    paymentLines,
  } = useCartStore();

  const sub = subtotal();
  const disc = discountValue();
  const tax = taxAmount(taxRate);
  const tot = total(taxRate);
  const change = Math.max(0, (amountTendered ?? 0) - tot);

  // Auto-switch to cart tab on mobile whenever a new item is added
  useEffect(() => {
    if (items.length > prevItemsLenRef.current && items.length > 0) {
      setMobileTab("cart");
    }
    prevItemsLenRef.current = items.length;
  }, [items.length]);

  const [noteOpenFor, setNoteOpenFor] = useState<string | null>(null);

  if (!isClient) {
    return (
      <div className="bg-background flex h-full flex-col items-center justify-center space-y-4">
        <div className="bg-muted flex h-12 w-12 animate-pulse items-center justify-center rounded-full" />
        <div className="text-muted-foreground animate-pulse text-sm font-medium">
          Initializing POS...
        </div>
      </div>
    );
  }

  function handleSaleComplete(saleId: string, receiptReference: string, isOffline?: boolean) {
    const data: ReceiptData = {
      saleId,
      receiptReference,
      customerName: customer?.name || undefined,
      items: items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        total: i.price * i.quantity,
        notes: i.notes || undefined,
        unit: i.unit,
      })),
      subtotal: sub,
      discountAmount: disc,
      taxAmount: tax,
      total: tot,
      paymentMethod,
      paymentLines: paymentLines.length > 0 ? paymentLines : undefined,
      amountTendered: amountTendered ?? 0,
      changeDue: change,
      createdAt: new Date(),
    };
    setReceiptData(data);

    if (isOffline) {
      toast.info(`Offline receipt ${receiptReference} generated. Queued for auto-sync.`, {
        duration: 5000,
      });
    }

    // Notify application that stock levels changed
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("pos:stock-changed"));
    }

    // Explicitly alert user if any purchased product is now low on stock or out of stock
    for (const item of items) {
      const threshold = item.lowStockThreshold ?? 5;
      const remainingStock = item.stock - item.quantity;
      if (remainingStock <= 0) {
        toast.error(`Stock Alert: "${item.name}" is now OUT OF STOCK (0/${threshold} ${item.unit})`, {
          duration: 6000,
        });
      } else if (remainingStock <= threshold) {
        toast.warning(`Low Stock Warning: "${item.name}" stock fell to ${remainingStock}/${threshold} ${item.unit}`, {
          duration: 5000,
        });
      }
    }

    clearCart();
    setCustomer(null);
  }

  function handleVoidItem(productId: string) {
    setVoidTargetId(productId);
  }

  function handleVoidConfirm(_reason?: string) {
    if (voidTargetId) removeItem(voidTargetId);
    setVoidTargetId(null);
  }

  const voidTargetItem = items.find((i) => i.productId === voidTargetId);

  return (
    <div className="bg-background flex h-full flex-col lg:flex-row">
      {/* Mobile tab bar with crisp active line */}
      <div className="border-border/80 bg-card flex shrink-0 border-b lg:hidden">
        <button
          onClick={() => setMobileTab("search")}
          className={cn(
            "-mb-px flex-1 border-b-2 py-3 text-xs font-bold tracking-wider uppercase transition-colors",
            mobileTab === "search"
              ? "text-primary border-primary"
              : "text-muted-foreground border-transparent"
          )}
        >
          {tp("title")}
        </button>
        <button
          onClick={() => setMobileTab("cart")}
          className={cn(
            "-mb-px flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 text-xs font-bold tracking-wider uppercase transition-colors",
            mobileTab === "cart"
              ? "text-primary border-primary"
              : "text-muted-foreground border-transparent"
          )}
        >
          <span>Cart</span>
          {items.length > 0 && (
            <span className="bg-primary text-primary-foreground inline-flex h-4 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-bold">
              {items.length}
            </span>
          )}
        </button>
      </div>

      {/* Left Pane: Product Catalog & Search */}
      <div
        className={cn(
          "lg:border-border/80 overflow-y-auto p-4 lg:flex-1 lg:border-r lg:p-5",
          mobileTab === "cart" ? "hidden lg:block" : "flex-1"
        )}
      >
        <ProductSearch />
      </div>

      {/* Right Pane: Variant A Bordered Ticket Cart */}
      <div
        className={cn(
          "bg-card/60 flex flex-col backdrop-blur-xs lg:w-[27rem] lg:flex-none lg:shrink-0",
          mobileTab === "search" ? "hidden lg:flex" : "flex flex-1"
        )}
      >
        {/* Cart Toolbar with hairline border */}
        <div className="border-border/80 bg-muted/20 flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <ShoppingBag className="text-primary h-4 w-4" />
            <span className="text-foreground text-xs font-bold tracking-wider uppercase">
              Cart {items.length > 0 ? `(${items.length})` : ""}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsLocked(true)}
              title="Lock Terminal (F6)"
              className="border-border hover:bg-accent text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium shadow-2xs transition-colors"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Lock</span>
            </button>
            <button
              onClick={() => setShowHeldOrders(true)}
              className="border-border hover:bg-accent text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium shadow-2xs transition-colors"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              <span>Held</span>
            </button>
            <button
              onClick={() => setShowShortcuts(true)}
              title="Keyboard shortcuts (?)"
              className="border-border hover:bg-accent text-muted-foreground hover:text-foreground flex h-7 w-7 items-center justify-center rounded-md border font-mono text-xs font-semibold shadow-2xs transition-colors"
            >
              ?
            </button>
          </div>
        </div>

        {/* Customer capture bar */}
        <div className="border-border/80 bg-background/50 border-b px-4 py-2.5">
          <CustomerCapture value={customer} onChange={setCustomer} />
        </div>

        {/* Cart items list */}
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {items.length === 0 ? (
            <div className="text-muted-foreground border-border/70 flex h-48 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm">
              <Receipt className="text-muted-foreground/40 mb-2 h-8 w-8" />
              <p className="text-foreground/70 font-medium">{t("cart_empty")}</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <motion.div
                  key={item.productId}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  className="border-border/80 bg-card hover:border-primary/30 overflow-hidden rounded-lg border shadow-2xs transition-colors"
                >
                  <div className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground truncate text-sm leading-tight font-semibold">
                        {item.name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <p className="text-muted-foreground font-mono text-xs">
                          {formatCurrency(item.price)} / {item.unit}
                        </p>
                        {item.stock <= (item.lowStockThreshold ?? 5) && (
                          <span className="text-[10px] font-mono font-semibold text-amber-600 dark:text-amber-400">
                            · Low ({item.stock} left)
                          </span>
                        )}
                        {item.quantity > item.stock && (
                          <span className="text-[10px] font-bold text-destructive">
                            · Exceeds stock ({item.stock})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quantity controls */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          updateQuantity(
                            item.productId,
                            item.quantity - 1 / 10 ** item.quantityPrecision
                          )
                        }
                        className="border-border/80 hover:bg-accent flex h-7 w-7 items-center justify-center rounded-md border transition-colors active:scale-95"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      {isTouchDevice ? (
                        <button
                          onClick={() =>
                            setKeypad({
                              open: true,
                              itemId: item.productId,
                              value: String(item.quantity),
                            })
                          }
                          className="border-border/80 bg-background hover:bg-accent h-7 w-12 rounded-md border px-1 text-center font-mono text-xs font-bold transition-all active:scale-95"
                          aria-label="Quantity — tap to edit"
                        >
                          {item.quantity}
                        </button>
                      ) : (
                        <input
                          type="number"
                          step={1 / 10 ** item.quantityPrecision}
                          min={1 / 10 ** item.quantityPrecision}
                          value={item.quantity}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val) && val > 0) updateQuantity(item.productId, val);
                          }}
                          onFocus={(e) => e.target.select()}
                          className="border-border/80 bg-background focus:ring-primary h-7 w-12 [appearance:textfield] rounded-md border px-1 text-center font-mono text-xs font-bold focus:ring-1 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          aria-label="Quantity"
                        />
                      )}
                      <button
                        onClick={() =>
                          updateQuantity(
                            item.productId,
                            item.quantity + 1 / 10 ** item.quantityPrecision
                          )
                        }
                        className="border-border/80 hover:bg-accent flex h-7 w-7 items-center justify-center rounded-md border transition-colors active:scale-95"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Line Total */}
                    <span className="text-foreground w-16 text-right font-mono text-sm font-bold">
                      {formatCurrency(item.price * item.quantity)}
                    </span>

                    {/* Note toggle */}
                    <button
                      onClick={() =>
                        setNoteOpenFor(noteOpenFor === item.productId ? null : item.productId)
                      }
                      className={cn(
                        "rounded-md p-1 transition-colors",
                        item.notes
                          ? "text-primary bg-primary/10"
                          : "text-muted-foreground/60 hover:text-foreground"
                      )}
                      aria-label="Add note"
                      title="Item note"
                    >
                      <MessageSquarePlus className="h-4 w-4" />
                    </button>

                    {/* Void item */}
                    <button
                      onClick={() => handleVoidItem(item.productId)}
                      className="text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded-md p-1 transition-colors"
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Inline notes */}
                  {noteOpenFor === item.productId && (
                    <div className="border-border/40 border-t px-3 pt-0 pb-2.5">
                      <input
                        autoFocus
                        type="text"
                        value={item.notes || ""}
                        onChange={(e) => updateItemNotes(item.productId, e.target.value)}
                        placeholder="Add note..."
                        className="border-border bg-muted/30 focus:ring-primary mt-2 w-full rounded-md border px-2.5 py-1 text-xs focus:ring-1 focus:outline-none"
                        onKeyDown={(e) => e.key === "Enter" && setNoteOpenFor(null)}
                      />
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Order Summary with crisp hairline lines */}
        <div className="border-border/80 bg-muted/20 space-y-1.5 border-t p-4 text-xs font-medium">
          <div className="text-muted-foreground flex justify-between">
            <span>{t("subtotal")}</span>
            <span className="font-mono">{formatCurrency(sub)}</span>
          </div>

          {disc > 0 && (
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>{t("discount")}</span>
              <span className="font-mono">−{formatCurrency(disc)}</span>
            </div>
          )}

          {tax > 0 && (
            <div className="text-muted-foreground flex justify-between">
              <span>{t("tax")}</span>
              <span className="font-mono">{formatCurrency(tax)}</span>
            </div>
          )}

          {/* Grand Total Bar */}
          <div className="border-border/80 text-foreground mt-1 flex items-baseline justify-between border-t pt-2.5 text-sm font-bold">
            <span className="text-xs tracking-wider uppercase">{t("total")}</span>
            <span className="text-primary font-mono text-xl font-extrabold">
              {formatCurrency(tot)}
            </span>
          </div>
        </div>

        {/* Payment Panel */}
        <PaymentPanel
          taxRate={taxRate}
          onClear={() => {
            if (items.length > 0) setConfirmClear(true);
          }}
          onOfflineSaleQueued={() => {
            clearCart();
            setCustomer(null);
          }}
          onSaleComplete={handleSaleComplete}
          onHoldOrders={() => setShowHeldOrders(true)}
          customerId={customer?.id}
        />
      </div>

      {/* Held orders modal */}
      <HeldOrdersModal open={showHeldOrders} onClose={() => setShowHeldOrders(false)} />

      {/* Void item modal */}
      <VoidItemModal
        open={!!voidTargetId}
        itemName={voidTargetItem?.name ?? ""}
        onConfirm={handleVoidConfirm}
        onCancel={() => setVoidTargetId(null)}
      />

      {/* Receipt modal */}
      {receiptData && (
        <ReceiptModal
          open={true}
          onClose={() => setReceiptData(null)}
          data={receiptData}
          settings={DEFAULT_RECEIPT_SETTINGS}
        />
      )}

      {/* Clear cart confirmation */}
      <AlertDialog
        open={confirmClear}
        title="Clear order ticket?"
        description="This will remove all items from the current order."
        confirmLabel="Clear Ticket"
        cancelLabel="Keep Items"
        variant="destructive"
        onConfirm={() => {
          clearCart();
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />

      {/* Numeric keypad for touch devices */}
      <NumericKeypad
        open={keypad.open}
        value={keypad.value}
        label={items.find((i) => i.productId === keypad.itemId)?.name}
        onValueChange={(v) => setKeypad((k) => ({ ...k, value: v }))}
        onConfirm={() => {
          const val = parseFloat(keypad.value);
          if (!isNaN(val) && val > 0) updateQuantity(keypad.itemId, val);
          setKeypad({ open: false, itemId: "", value: "1" });
        }}
        onCancel={() => setKeypad({ open: false, itemId: "", value: "1" })}
      />

      {/* Keyboard shortcuts modal */}
      {showShortcuts && <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />}

      {/* POS Lock Screen Overlay */}
      <PosLockOverlay isOpen={isLocked} onUnlock={() => setIsLocked(false)} />
    </div>
  );
}
