import { ReceiptData, ReceiptItem } from "@/components/receipt/receipt";
import {
  CheckoutPort,
  CheckoutIntent,
  CheckoutResult,
  CheckoutStoragePort,
  LowStockAlert,
} from "./types";

export class OfflineCheckoutAdapter implements CheckoutPort {
  constructor(private storage: CheckoutStoragePort) {}

  async execute(intent: CheckoutIntent): Promise<CheckoutResult> {
    if (!intent.items || intent.items.length === 0) {
      throw new Error("Cannot checkout with an empty cart");
    }

    // 1. Strict Stock Validation: Ensure adequate local stock before mutating
    for (const item of intent.items) {
      const conversion = item.conversionQty && item.conversionQty > 0 ? item.conversionQty : 1;
      const requiredQty = item.quantity * conversion;
      const cached = await this.storage.getProduct(item.productId);

      if (cached) {
        if (cached.stock + 1e-7 < requiredQty) {
          throw new Error(
            `Insufficient stock for "${item.name}": requires ${requiredQty} ${cached.unit || "unit"}s, only ${cached.stock} available locally.`
          );
        }
      }
    }

    // 2. Decrement Local Stock Allocation
    const lowStockAlerts: LowStockAlert[] = [];
    for (const item of intent.items) {
      const conversion = item.conversionQty && item.conversionQty > 0 ? item.conversionQty : 1;
      const deduction = item.quantity * conversion;
      const decremented = await this.storage.decrementStock(item.productId, deduction);

      if (decremented) {
        if (decremented.updatedStock <= decremented.lowStockThreshold) {
          lowStockAlerts.push({
            productId: item.productId,
            name: decremented.name,
            unit: decremented.unit,
            remainingStock: decremented.updatedStock,
            threshold: decremented.lowStockThreshold,
            isOutOfStock: decremented.updatedStock <= 0,
          });
        }
      }
    }

    // 3. Allocate Offline Receipt Reference
    const seriesPrefix = (intent.receiptSeriesName || "POS").toUpperCase();
    const seq = this.storage.allocateReceiptSequence(seriesPrefix);
    const receiptReference = `${seriesPrefix}-OFF-${String(seq).padStart(6, "0")}`;
    const saleId = `offline_${Date.now()}_${seq}`;

    // 4. Calculate Financials
    const subtotal = intent.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discountAmount =
      intent.discountType === "percent"
        ? (subtotal * (intent.discountAmount || 0)) / 100
        : Math.min(intent.discountAmount || 0, subtotal);
    const taxableAmount = Math.max(0, subtotal - discountAmount);
    const taxAmount = (taxableAmount * (intent.taxRate || 0)) / 100;
    const total = taxableAmount + taxAmount;

    let changeDue = 0;
    if (intent.paymentLines && intent.paymentLines.length > 0) {
      const totalPaid = intent.paymentLines.reduce((s, l) => s + l.amount, 0);
      changeDue = Math.max(0, totalPaid - total);
    } else if (intent.paymentMethod === "CASH" && intent.amountTendered !== undefined) {
      changeDue = Math.max(0, intent.amountTendered - total);
    }

    // 5. Construct Durable Server Queue Payload
    const serverPayload: Record<string, unknown> = {
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
      serverPayload.paymentLines = intent.paymentLines;
    } else {
      serverPayload.paymentMethod = intent.paymentMethod;
      if (intent.paymentMethod === "CASH") {
        serverPayload.amountTendered = intent.amountTendered ?? total;
      }
    }

    const pending = this.storage.recordPendingCheckout(intent.originatingUserId, serverPayload);
    serverPayload.clientRequestId = pending.id;

    // 6. Enqueue Offline Write
    await this.storage.enqueueSyncItem(
      "/api/sales",
      "POST",
      serverPayload,
      intent.originatingUserId
    );
    this.storage.completeCheckoutSession(intent.originatingUserId);

    // 7. Assemble Complete ReceiptData
    const receiptItems: ReceiptItem[] = intent.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      total: item.price * item.quantity,
      notes: item.notes,
      unit: item.unit,
    }));

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

    // 8. Dispatch notification event in browser
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("pos:stock-changed", {
          detail: { lowStockAlerts },
        })
      );
    }

    return {
      success: true,
      saleId,
      receiptReference,
      isOffline: true,
      receiptData,
      lowStockAlerts,
      message: "Offline sale recorded — provisional receipt issued and queued for synchronization.",
    };
  }
}
