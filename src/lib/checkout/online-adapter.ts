import { ReceiptData, ReceiptItem } from "@/components/receipt/receipt";
import { CheckoutPort, CheckoutIntent, CheckoutResult, LowStockAlert } from "./types";
import { pendingCheckout, completeCheckout } from "@/lib/browser-session";

export class OnlineCheckoutAdapter implements CheckoutPort {
  async execute(intent: CheckoutIntent): Promise<CheckoutResult> {
    if (!intent.items || intent.items.length === 0) {
      throw new Error("Cannot checkout with an empty cart");
    }

    const subtotal = intent.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discountAmount =
      intent.discountType === "percent"
        ? (subtotal * (intent.discountAmount || 0)) / 100
        : Math.min(intent.discountAmount || 0, subtotal);
    const taxableAmount = Math.max(0, subtotal - discountAmount);
    const taxAmount = (taxableAmount * (intent.taxRate || 0)) / 100;
    const total = taxableAmount + taxAmount;

    const body: Record<string, unknown> = {
      receiptSeriesId: intent.receiptSeriesId,
      drSiNumber: intent.drSiNumber || undefined,
      items: intent.items.map((i) => ({
        productId: i.productId,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        notes: i.notes || undefined,
        packagingId: i.packagingId,
      })),
      taxRate: intent.taxRate,
      discountAmount: intent.discountAmount,
      discountType: intent.discountType,
      tipAmount: intent.tipAmount || 0,
      note: intent.note || undefined,
      customerId: intent.customerId || undefined,
      loyaltyPointsUsed: intent.loyaltyPointsUsed || 0,
      originatingUserId: intent.originatingUserId,
    };

    if (intent.paymentLines && intent.paymentLines.length > 0) {
      body.paymentLines = intent.paymentLines;
    } else {
      body.paymentMethod = intent.paymentMethod;
      if (intent.paymentMethod === "CASH") {
        body.amountTendered = intent.amountTendered ?? total;
      }
    }

    const pending = pendingCheckout(intent.originatingUserId, body);
    body.clientRequestId = pending.id;

    const reqHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (intent.sessionToken) {
      reqHeaders["Authorization"] = `Bearer ${intent.sessionToken}`;
      reqHeaders["x-session-token"] = intent.sessionToken;
    }

    const res = await fetch("/api/sales", {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let errorMessage = "Failed to complete sale";
      try {
        const errJson = await res.json();
        if (errJson?.error) errorMessage = errJson.error;
      } catch {
        // Fall back to default
      }
      throw new Error(errorMessage);
    }

    const data = await res.json();
    completeCheckout(intent.originatingUserId);

    const sale = data.sale;
    const saleId = sale?.id ?? `sale_${Date.now()}`;
    const seriesPrefix = (intent.receiptSeriesName || "POS").toUpperCase();
    const receiptNumber = Number(sale?.receiptNumber ?? 0);
    const receiptReference = `${seriesPrefix}-${String(receiptNumber).padStart(6, "0")}`;

    const receiptItems: ReceiptItem[] = intent.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      total: item.price * item.quantity,
      notes: item.notes,
      unit: item.unit,
    }));

    let changeDue = 0;
    if (intent.paymentLines && intent.paymentLines.length > 0) {
      const totalPaid = intent.paymentLines.reduce((s, l) => s + l.amount, 0);
      changeDue = Math.max(0, totalPaid - total);
    } else if (intent.paymentMethod === "CASH" && intent.amountTendered !== undefined) {
      changeDue = Math.max(0, intent.amountTendered - total);
    }

    const receiptData: ReceiptData = {
      saleId,
      receiptReference,
      customerName: intent.customerName,
      items: receiptItems,
      subtotal,
      discountAmount,
      taxAmount,
      tipAmount: intent.tipAmount,
      total,
      paymentMethod: intent.paymentMethod,
      paymentLines: intent.paymentLines,
      amountTendered: intent.amountTendered ?? (intent.paymentMethod === "CASH" ? total : undefined),
      changeDue,
      createdAt: new Date(),
    };

    const lowStockAlerts: LowStockAlert[] = (data.lowStockAlerts ?? []).map(
      (alert: { productId: string; name: string; currentStock: number }) => ({
        productId: alert.productId,
        name: alert.name,
        unit: "unit",
        remainingStock: alert.currentStock,
        threshold: 5,
        isOutOfStock: alert.currentStock <= 0,
      })
    );

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("pos:stock-changed", {
          detail: { lowStockAlerts: data.lowStockAlerts ?? [] },
        })
      );
    }

    return {
      success: true,
      saleId,
      receiptReference,
      isOffline: false,
      receiptData,
      lowStockAlerts,
    };
  }
}
