import { ReceiptData, ReceiptItem } from "@/components/receipt/receipt";

export interface CheckoutItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  unit?: string;
  notes?: string;
  packagingId?: string;
  conversionQty?: number;
}

export interface CheckoutIntent {
  receiptSeriesId: string;
  receiptSeriesName?: string;
  drSiNumber?: string;
  items: CheckoutItem[];
  paymentMethod: "CASH" | "CARD" | "OTHER";
  paymentLines?: Array<{ method: "CASH" | "CARD" | "OTHER"; amount: number }>;
  amountTendered?: number;
  taxRate: number;
  discountAmount: number;
  discountType: "percent" | "fixed";
  tipAmount?: number;
  note?: string;
  customerId?: string;
  customerName?: string;
  loyaltyPointsUsed?: number;
  originatingUserId: string;
  sessionToken?: string | null;
}

export interface LowStockAlert {
  productId: string;
  name: string;
  unit: string;
  remainingStock: number;
  threshold: number;
  isOutOfStock: boolean;
}

export interface CheckoutResult {
  success: boolean;
  saleId: string;
  receiptReference: string;
  isOffline: boolean;
  receiptData: ReceiptData;
  lowStockAlerts: LowStockAlert[];
  message?: string;
}

export interface CheckoutPort {
  execute(intent: CheckoutIntent): Promise<CheckoutResult>;
}

export interface CachedProductRecord {
  id: string;
  name: string;
  price: number;
  stock: number;
  unit: string;
  lowStockThreshold?: number;
  quantityPrecision?: number;
}

export interface CheckoutStoragePort {
  getProduct(id: string): Promise<CachedProductRecord | null>;
  decrementStock(
    id: string,
    qty: number
  ): Promise<{ updatedStock: number; name: string; unit: string; lowStockThreshold: number } | null>;
  enqueueSyncItem(
    endpoint: string,
    method: string,
    payload: unknown,
    userId?: string
  ): Promise<void>;
  allocateReceiptSequence(seriesName: string): number;
  recordPendingCheckout(userId: string, payload: unknown): { id: string };
  completeCheckoutSession(userId: string): void;
}
