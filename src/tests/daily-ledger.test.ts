import { describe, expect, it } from "vitest";
import {
  businessDayUtcRange,
  businessDateForInstant,
  canViewLedgerField,
  csvCell,
  formatReceiptReference,
  isValidBusinessDate,
  isValidTimeZone,
  lastBusinessDateOfMonth,
  normalizeQuantity,
  quantityFitsPrecision,
  resolveLedgerScope,
  shiftBusinessDate,
} from "@/lib/daily-ledger";

describe("daily ledger domain", () => {
  it("normalizes a measured quantity to the product precision", () => {
    expect(normalizeQuantity(1.41367, 4)).toBe(1.4137);
    expect(normalizeQuantity(1.6, 0)).toBe(2);
  });

  it("rejects invalid quantity precision", () => {
    expect(() => normalizeQuantity(1, -1)).toThrow("precision");
    expect(() => normalizeQuantity(1, 5)).toThrow("precision");
  });

  it("validates quantity precision without rounding silently", () => {
    expect(quantityFitsPrecision(1.25, 2)).toBe(true);
    expect(quantityFitsPrecision(1.256, 2)).toBe(false);
    expect(quantityFitsPrecision(1, 0)).toBe(true);
  });

  it("validates and shifts business dates", () => {
    expect(isValidBusinessDate("2026-02-28")).toBe(true);
    expect(isValidBusinessDate("2026-02-29")).toBe(false);
    expect(shiftBusinessDate("2026-09-01", -1)).toBe("2026-08-31");
    expect(lastBusinessDateOfMonth("2026-02-01")).toBe("2026-02-28");
  });

  it("validates time zones and protects CSV formula cells", () => {
    expect(isValidTimeZone("Asia/Manila")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(csvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(csvCell("hello,world")).toBe('"hello,world"');
    expect(csvCell("hello\rworld")).toBe('"hello\rworld"');
    expect(csvCell(-12.5)).toBe("-12.5");
  });

  it("computes a Manila business day as a UTC range", () => {
    expect(businessDayUtcRange("2026-09-03", "Asia/Manila")).toEqual({
      start: new Date("2026-09-02T16:00:00.000Z"),
      endExclusive: new Date("2026-09-03T16:00:00.000Z"),
    });
  });

  it("derives the business date from an instant", () => {
    expect(businessDateForInstant(new Date("2026-09-02T16:30:00.000Z"), "Asia/Manila")).toBe(
      "2026-09-03"
    );
  });

  it("prevents cashiers from viewing cost, profit, and selling value fields", () => {
    expect(canViewLedgerField("CASHIER", "unitCost")).toBe(false);
    expect(canViewLedgerField("CASHIER", "grossProfit")).toBe(false);
    expect(canViewLedgerField("CASHIER", "sellingValue")).toBe(false);
    expect(canViewLedgerField("ADMIN", "unitCost")).toBe(true);
    expect(canViewLedgerField("ADMIN", "sellingValue")).toBe(true);
  });

  it("forces cashiers to their own current business day", () => {
    expect(
      resolveLedgerScope({
        role: "CASHIER",
        userId: "cashier-1",
        today: "2026-09-03",
        requested: { from: "2020-01-01", to: "2030-01-01", cashierId: "other" },
      })
    ).toEqual({
      from: "2026-09-03",
      to: "2026-09-03",
      cashierId: "cashier-1",
    });
  });

  it("preserves administrator ledger filters", () => {
    expect(
      resolveLedgerScope({
        role: "ADMIN",
        userId: "admin",
        today: "2026-09-03",
        requested: { from: "2026-09-01", to: "2026-09-02", cashierId: "cashier-2" },
      })
    ).toEqual({
      from: "2026-09-01",
      to: "2026-09-02",
      cashierId: "cashier-2",
    });
  });

  it("keeps legacy backfills visibly distinguishable", () => {
    expect(formatReceiptReference({ legacyReference: "sale_123", backfilled: true })).toEqual({
      label: "LEGACY-sale_123",
      warning: "Backfilled estimate",
    });
  });

  it("formats native receipt series and number", () => {
    expect(formatReceiptReference({ seriesName: "211", receiptNumber: 42 })).toEqual({
      label: "211-000042",
      warning: null,
    });
  });
});
