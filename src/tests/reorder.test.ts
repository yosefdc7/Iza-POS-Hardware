import { describe, it, expect } from "vitest";
import {
  calculateSuggestedReorderQty,
  groupReorderItemsBySupplier,
  type ReorderProduct,
} from "@/lib/reorder";

describe("Reorder Helper Logic & Supplier Calculations", () => {
  describe("calculateSuggestedReorderQty", () => {
    it("calculates basic deficit when stock is below threshold with 1x multiplier", () => {
      expect(calculateSuggestedReorderQty(0, 10, 1)).toBe(10);
      expect(calculateSuggestedReorderQty(3, 10, 1)).toBe(7);
      expect(calculateSuggestedReorderQty(8, 10, 1)).toBe(2);
    });

    it("applies 2x and 3x multipliers for target restock buffers", () => {
      // Threshold 10, 2x multiplier = target 20. Current stock 4 -> 16
      expect(calculateSuggestedReorderQty(4, 10, 2)).toBe(16);
      // Threshold 10, 3x multiplier = target 30. Current stock 0 -> 30
      expect(calculateSuggestedReorderQty(0, 10, 3)).toBe(30);
      // Threshold 5, 1.5x multiplier = target 8 (ceil). Current stock 2 -> 6
      expect(calculateSuggestedReorderQty(2, 5, 1.5)).toBe(6);
    });

    it("safeguards to at least 1 unit if current stock equals or exceeds target", () => {
      expect(calculateSuggestedReorderQty(10, 10, 1)).toBe(1);
      expect(calculateSuggestedReorderQty(15, 10, 1)).toBe(1);
    });
  });

  describe("groupReorderItemsBySupplier", () => {
    const mockProducts: ReorderProduct[] = [
      {
        id: "prod-1",
        name: "Coca Cola 1.5L",
        sku: "COKE-15",
        barcode: "48019812",
        category: "Beverages",
        unit: "btl",
        stock: 2,
        lowStockThreshold: 10,
        cost: 45.0,
        price: 60.0,
        supplierId: "sup-coke",
        supplier: {
          id: "sup-coke",
          name: "Coca-Cola Beverages Corp",
          contactPerson: "Juan Dela Cruz",
          email: "orders@coke.ph",
          phone: "09171234567",
          address: "Manila, Philippines",
        },
      },
      {
        id: "prod-2",
        name: "Sprite 1.5L",
        sku: "SPRITE-15",
        barcode: "48019813",
        category: "Beverages",
        unit: "btl",
        stock: 0,
        lowStockThreshold: 8,
        cost: 44.0,
        price: 58.0,
        supplierId: "sup-coke",
        supplier: {
          id: "sup-coke",
          name: "Coca-Cola Beverages Corp",
          contactPerson: "Juan Dela Cruz",
          email: "orders@coke.ph",
          phone: "09171234567",
          address: "Manila, Philippines",
        },
      },
      {
        id: "prod-3",
        name: "San Miguel Pale Pilsen",
        sku: "SMB-PALE",
        barcode: "48029911",
        category: "Liquor",
        unit: "can",
        stock: 4,
        lowStockThreshold: 20,
        cost: 38.0,
        price: 50.0,
        supplierId: "sup-smb",
        supplier: {
          id: "sup-smb",
          name: "San Miguel Brewery Inc",
          contactPerson: "Maria Santos",
          email: "smb@sanmiguel.ph",
          phone: "09187654321",
          address: "Mandaluyong City",
        },
      },
      {
        id: "prod-4",
        name: "Generic Plastic Cups",
        sku: "CUP-50",
        barcode: null,
        category: "Supplies",
        unit: "pack",
        stock: 1,
        lowStockThreshold: 5,
        cost: 20.0,
        price: 30.0,
        supplierId: null,
        supplier: null,
      },
    ];

    it("correctly groups items by supplier and groups unassigned products", () => {
      const { groups, summary } = groupReorderItemsBySupplier(mockProducts, 1);

      expect(groups.length).toBe(3); // Coca-Cola, San Miguel, Unassigned

      // Summary checks
      expect(summary.totalLowStockCount).toBe(4);
      expect(summary.outOfStockCount).toBe(1); // Sprite is 0 stock
      expect(summary.supplierCount).toBe(2); // 2 named suppliers

      // Coca Cola group checks
      const cokeGroup = groups.find((g) => g.supplierId === "sup-coke");
      expect(cokeGroup).toBeDefined();
      expect(cokeGroup?.supplierName).toBe("Coca-Cola Beverages Corp");
      expect(cokeGroup?.items.length).toBe(2);
      // Coke 1.5L suggested qty: 10 - 2 = 8. Cost: 8 * 45 = 360
      // Sprite 1.5L suggested qty: 8 - 0 = 8. Cost: 8 * 44 = 352
      expect(cokeGroup?.totalUnits).toBe(16);
      expect(cokeGroup?.totalEstimatedCost).toBe(712);

      // San Miguel group checks
      const smbGroup = groups.find((g) => g.supplierId === "sup-smb");
      expect(smbGroup).toBeDefined();
      // SMB Pale suggested qty: 20 - 4 = 16. Cost: 16 * 38 = 608
      expect(smbGroup?.totalUnits).toBe(16);
      expect(smbGroup?.totalEstimatedCost).toBe(608);

      // Unassigned group checks
      const unassignedGroup = groups.find((g) => g.supplierId === "unassigned");
      expect(unassignedGroup).toBeDefined();
      // Cup suggested qty: 5 - 1 = 4. Cost: 4 * 20 = 80
      expect(unassignedGroup?.totalUnits).toBe(4);
      expect(unassignedGroup?.totalEstimatedCost).toBe(80);

      // Grand total check: 712 + 608 + 80 = 1400
      expect(summary.totalEstimatedCost).toBe(1400);
      expect(summary.totalSuggestedUnits).toBe(36);
    });

    it("respects manual custom quantity overrides", () => {
      // Override Coke 1.5L to order 20 units instead of calculated 8
      const overrides = {
        "prod-1": 20,
      };
      const { groups, summary } = groupReorderItemsBySupplier(mockProducts, 1, overrides);

      const cokeGroup = groups.find((g) => g.supplierId === "sup-coke");
      const cokeItem = cokeGroup?.items.find((i) => i.id === "prod-1");

      expect(cokeItem?.suggestedQty).toBe(20);
      expect(cokeItem?.totalCost).toBe(20 * 45); // 900
      // Coke group total: 900 + 352 = 1252
      expect(cokeGroup?.totalEstimatedCost).toBe(1252);
      // Grand total: 1252 + 608 + 80 = 1940
      expect(summary.totalEstimatedCost).toBe(1940);
    });
  });
});
