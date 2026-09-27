import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CheckoutEngine,
  OnlineCheckoutAdapter,
  OfflineCheckoutAdapter,
  MemoryStorageAdapter,
  CheckoutIntent,
  CheckoutPort,
  CheckoutResult,
} from "@/lib/checkout";

describe("CheckoutModule (Architecture Deepening Candidate 1)", () => {
  let memoryStorage: MemoryStorageAdapter;
  let offlineAdapter: OfflineCheckoutAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    memoryStorage = new MemoryStorageAdapter([
      {
        id: "prod-1",
        name: "Standard Nail 2-inch",
        price: 10,
        stock: 50,
        unit: "pc",
        lowStockThreshold: 10,
      },
      {
        id: "prod-2",
        name: "Premium Cement Bag",
        price: 250,
        stock: 5,
        unit: "bag",
        lowStockThreshold: 5,
      },
      {
        id: "prod-box",
        name: "Drywall Screws",
        price: 5,
        stock: 150,
        unit: "pc",
        lowStockThreshold: 20,
      },
    ]);
    offlineAdapter = new OfflineCheckoutAdapter(memoryStorage);
  });

  const baseIntent: CheckoutIntent = {
    receiptSeriesId: "series-211",
    receiptSeriesName: "211",
    drSiNumber: "DR-9001",
    items: [
      {
        productId: "prod-1",
        name: "Standard Nail 2-inch",
        price: 10,
        quantity: 5,
        unit: "pc",
      },
    ],
    paymentMethod: "CASH",
    amountTendered: 100,
    taxRate: 12,
    discountAmount: 0,
    discountType: "fixed",
    originatingUserId: "user-cashier-1",
  };

  describe("Offline Checkout & Immediate Receipt Generation", () => {
    it("generates an immediate [Series]-OFF-[Sequence] receipt and decrements local stock", async () => {
      const result = await offlineAdapter.execute(baseIntent);

      expect(result.success).toBe(true);
      expect(result.isOffline).toBe(true);
      expect(result.receiptReference).toBe("211-OFF-000001");
      expect(result.receiptData).toBeDefined();
      expect(result.receiptData.receiptReference).toBe("211-OFF-000001");
      expect(result.receiptData.items).toHaveLength(1);
      expect(result.receiptData.items[0].name).toBe("Standard Nail 2-inch");
      expect(result.receiptData.subtotal).toBe(50);
      expect(result.receiptData.taxAmount).toBe(6); // 12% of 50
      expect(result.receiptData.total).toBe(56);
      expect(result.receiptData.changeDue).toBe(44); // 100 - 56

      // Assert local stock decremented in storage seam
      const updatedProduct = await memoryStorage.getProduct("prod-1");
      expect(updatedProduct?.stock).toBe(45); // 50 - 5

      // Assert queued to durable outbox
      const queued = memoryStorage.getEnqueuedItems();
      expect(queued).toHaveLength(1);
      expect(queued[0].endpoint).toBe("/api/sales");
      expect(queued[0].method).toBe("POST");
      expect(queued[0].userId).toBe("user-cashier-1");
      const payload = queued[0].payload as Record<string, unknown>;
      expect(payload.clientRequestId).toBeDefined();
      expect(payload.drSiNumber).toBe("DR-9001");
    });

    it("increments sequential offline receipt counter across multiple transactions", async () => {
      const res1 = await offlineAdapter.execute(baseIntent);
      const res2 = await offlineAdapter.execute(baseIntent);
      const res3 = await offlineAdapter.execute({
        ...baseIntent,
        receiptSeriesId: "series-chb",
        receiptSeriesName: "CHB",
      });

      expect(res1.receiptReference).toBe("211-OFF-000001");
      expect(res2.receiptReference).toBe("211-OFF-000002");
      expect(res3.receiptReference).toBe("CHB-OFF-000001");
    });

    it("triggers low-stock alert when remaining local stock falls to threshold", async () => {
      const cementIntent: CheckoutIntent = {
        ...baseIntent,
        items: [
          {
            productId: "prod-2",
            name: "Premium Cement Bag",
            price: 250,
            quantity: 2, // 5 - 2 = 3 (threshold is 5)
            unit: "bag",
          },
        ],
      };

      const result = await offlineAdapter.execute(cementIntent);

      expect(result.lowStockAlerts).toHaveLength(1);
      expect(result.lowStockAlerts[0].productId).toBe("prod-2");
      expect(result.lowStockAlerts[0].remainingStock).toBe(3);
      expect(result.lowStockAlerts[0].isOutOfStock).toBe(false);

      const updated = await memoryStorage.getProduct("prod-2");
      expect(updated?.stock).toBe(3);
    });

    it("triggers out-of-stock alert when remaining local stock reaches zero", async () => {
      const cementIntent: CheckoutIntent = {
        ...baseIntent,
        items: [
          {
            productId: "prod-2",
            name: "Premium Cement Bag",
            price: 250,
            quantity: 5, // 5 - 5 = 0
            unit: "bag",
          },
        ],
      };

      const result = await offlineAdapter.execute(cementIntent);

      expect(result.lowStockAlerts).toHaveLength(1);
      expect(result.lowStockAlerts[0].remainingStock).toBe(0);
      expect(result.lowStockAlerts[0].isOutOfStock).toBe(true);
    });
  });

  describe("Strict Stock Validation Policy", () => {
    it("rejects checkout when requested quantity exceeds available local stock", async () => {
      const excessiveIntent: CheckoutIntent = {
        ...baseIntent,
        items: [
          {
            productId: "prod-1",
            name: "Standard Nail 2-inch",
            price: 10,
            quantity: 100, // only 50 available!
            unit: "pc",
          },
        ],
      };

      await expect(offlineAdapter.execute(excessiveIntent)).rejects.toThrow(
        /Insufficient stock for "Standard Nail 2-inch"/i
      );

      // Verify stock was NOT deducted
      const product = await memoryStorage.getProduct("prod-1");
      expect(product?.stock).toBe(50);
      expect(memoryStorage.getEnqueuedItems()).toHaveLength(0);
    });

    it("correctly calculates base conversion quantities for packaging units (e.g. boxes)", async () => {
      // prod-box has 150 pcs in stock.
      // Customer orders 2 boxes of 100 pcs = 200 pcs total!
      const packagingIntent: CheckoutIntent = {
        ...baseIntent,
        items: [
          {
            productId: "prod-box",
            name: "Drywall Screws (Box of 100)",
            price: 450,
            quantity: 2,
            unit: "box",
            packagingId: "pkg-100",
            conversionQty: 100, // 2 * 100 = 200 pcs
          },
        ],
      };

      await expect(offlineAdapter.execute(packagingIntent)).rejects.toThrow(
        /requires 200 pcs, only 150 available locally/i
      );

      // But 1 box (100 pcs) fits within 150 pcs!
      const validPackagingIntent: CheckoutIntent = {
        ...packagingIntent,
        items: [
          {
            productId: "prod-box",
            name: "Drywall Screws (Box of 100)",
            price: 450,
            quantity: 1,
            unit: "box",
            packagingId: "pkg-100",
            conversionQty: 100,
          },
        ],
      };

      const result = await offlineAdapter.execute(validPackagingIntent);
      expect(result.success).toBe(true);

      const updated = await memoryStorage.getProduct("prod-box");
      expect(updated?.stock).toBe(50); // 150 - 100 = 50
    });
  });

  describe("CheckoutEngine Seamless Network Fallback", () => {
    it("uses online adapter when network request succeeds", async () => {
      const mockOnlinePort: CheckoutPort = {
        execute: vi.fn().mockResolvedValue({
          success: true,
          saleId: "server-sale-101",
          receiptReference: "211-000456",
          isOffline: false,
          receiptData: {
            saleId: "server-sale-101",
            receiptReference: "211-000456",
            items: [],
            subtotal: 50,
            discountAmount: 0,
            taxAmount: 6,
            total: 56,
            paymentMethod: "CASH",
          },
          lowStockAlerts: [],
        }),
      };

      const engine = new CheckoutEngine(mockOnlinePort, offlineAdapter);
      const result = await engine.execute(baseIntent);

      expect(mockOnlinePort.execute).toHaveBeenCalledWith(baseIntent);
      expect(result.isOffline).toBe(false);
      expect(result.receiptReference).toBe("211-000456");
      expect(memoryStorage.getEnqueuedItems()).toHaveLength(0); // offline not invoked
    });

    it("automatically falls back to offline adapter when online fetch fails with network error", async () => {
      const mockOnlinePort: CheckoutPort = {
        execute: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
      };

      const engine = new CheckoutEngine(mockOnlinePort, offlineAdapter);
      const result = await engine.execute(baseIntent);

      expect(mockOnlinePort.execute).toHaveBeenCalled();
      expect(result.isOffline).toBe(true);
      expect(result.receiptReference).toBe("211-OFF-000001");
      expect(result.receiptData).toBeDefined();

      // Confirms local stock decremented and sale queued
      const stock = await memoryStorage.getProduct("prod-1");
      expect(stock?.stock).toBe(45);
      expect(memoryStorage.getEnqueuedItems()).toHaveLength(1);
    });

    it("does NOT fall back to offline when online request fails with an authoritative validation error", async () => {
      const mockOnlinePort: CheckoutPort = {
        execute: vi.fn().mockRejectedValue(new Error("Selected receipt series is inactive or expired")),
      };

      const engine = new CheckoutEngine(mockOnlinePort, offlineAdapter);

      await expect(engine.execute(baseIntent)).rejects.toThrow(
        "Selected receipt series is inactive or expired"
      );

      // Verify offline adapter was NOT invoked
      expect(memoryStorage.getEnqueuedItems()).toHaveLength(0);
    });
  });
});
