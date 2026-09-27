import { describe, it, expect } from "vitest";
import {
  DEFAULT_HARDWARE_UNITS,
  computeStockBreakdown,
  computePackagingPricing,
} from "@/lib/hardware-units";

describe("DEFAULT_HARDWARE_UNITS", () => {
  it("contains standard hardware units across expected categories", () => {
    expect(DEFAULT_HARDWARE_UNITS.length).toBeGreaterThan(20);
    const values = DEFAULT_HARDWARE_UNITS.map((u) => u.value);
    expect(values).toContain("pc");
    expect(values).toContain("box");
    expect(values).toContain("roll");
    expect(values).toContain("kg");
    expect(values).toContain("m");
    expect(values).toContain("sheet");
    expect(values).toContain("bag");
    expect(values).toContain("tin");
  });

  it("every unit has value, label, and category", () => {
    for (const unit of DEFAULT_HARDWARE_UNITS) {
      expect(unit.value).toBeTruthy();
      expect(unit.label).toBeTruthy();
      expect(unit.category).toBeTruthy();
    }
  });
});

describe("computeStockBreakdown", () => {
  const packagings = [
    {
      name: "Box",
      conversionQty: 100,
    },
  ];

  it("correctly calculates full boxes and loose units", () => {
    const res = computeStockBreakdown(435, "pc", packagings);
    expect(res).not.toBeNull();
    expect(res!.primaryPackName).toBe("Box");
    expect(res!.conversionQty).toBe(100);
    expect(res!.fullBoxes).toBe(4);
    expect(res!.looseUnits).toBe(35);
    expect(res!.formattedText).toBe("4 boxes + 35 pc");
  });

  it("handles exact multiples with zero remainder", () => {
    const res = computeStockBreakdown(500, "pc", packagings);
    expect(res).not.toBeNull();
    expect(res!.fullBoxes).toBe(5);
    expect(res!.looseUnits).toBe(0);
    expect(res!.formattedText).toBe("5 boxes");
  });

  it("handles single box with no plural 'es'", () => {
    const res = computeStockBreakdown(100, "pc", packagings);
    expect(res).not.toBeNull();
    expect(res!.fullBoxes).toBe(1);
    expect(res!.looseUnits).toBe(0);
    expect(res!.formattedText).toBe("1 box");
  });

  it("handles stock less than 1 box", () => {
    const res = computeStockBreakdown(45, "pc", packagings);
    expect(res).not.toBeNull();
    expect(res!.fullBoxes).toBe(0);
    expect(res!.looseUnits).toBe(45);
    expect(res!.formattedText).toBe("45 pc");
  });

  it("returns null when no packaging exists or empty array", () => {
    expect(computeStockBreakdown(50, "pc", [])).toBeNull();
    expect(computeStockBreakdown(50, "pc", undefined)).toBeNull();
  });

  it("returns null when conversionQty is <= 1", () => {
    expect(computeStockBreakdown(50, "pc", [{ name: "Piece", conversionQty: 1 }])).toBeNull();
  });

  it("handles Decimal-like conversionQty objects", () => {
    const decimalPackagings = [
      {
        name: "Carton",
        conversionQty: { toString: () => "50" },
      },
    ];
    const res = computeStockBreakdown(125, "pc", decimalPackagings);
    expect(res).not.toBeNull();
    expect(res!.conversionQty).toBe(50);
    expect(res!.fullBoxes).toBe(2);
    expect(res!.looseUnits).toBe(25);
  });
});

describe("computePackagingPricing", () => {
  it("derives unit equivalent price and unit cost correctly", () => {
    const pricing = computePackagingPricing(100, 5, 450, 300);

    expect(pricing.unitEquivalentPrice).toBe(4.5);
    expect(pricing.derivedUnitCost).toBe(3);
    // Base total = 100 * 5 = 500. Box price = 450. Discount = (500 - 450)/500 * 100 = 10%
    expect(pricing.bulkDiscountPercent).toBe(10);
    expect(pricing.totalSavings).toBe(50);
  });

  it("handles missing prices gracefully", () => {
    const pricing = computePackagingPricing(100);

    expect(pricing.derivedUnitCost).toBeUndefined();
    expect(pricing.unitEquivalentPrice).toBeUndefined();
    expect(pricing.bulkDiscountPercent).toBeUndefined();
    expect(pricing.totalSavings).toBeUndefined();
  });

  it("handles box price without discount", () => {
    const pricing = computePackagingPricing(10, 5, 50);

    expect(pricing.unitEquivalentPrice).toBe(5);
    expect(pricing.bulkDiscountPercent).toBeUndefined();
    expect(pricing.totalSavings).toBeUndefined();
  });
});
