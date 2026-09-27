import { describe, expect, it } from "vitest";
import {
  calculateLedgerTotals,
  formatLedgerCsvRows,
  type LedgerSaleData,
} from "@/lib/daily-ledger";

describe("daily ledger pricing and company totals", () => {
  const sampleSales: LedgerSaleData[] = [
    {
      id: "sale-1",
      seriesName: "211",
      drSiNumber: "9804",
      receiptNumber: 1,
      businessDate: "2026-09-01",
      customer: "Rayvill",
      cashier: "Cashier 1",
      status: "COMPLETED",
      total: 1200,
      refundTotal: 0,
      items: [
        {
          id: "item-1",
          name: "White Sand",
          quantity: 15,
          unit: "Bags",
          unitPrice: 80,
          basePrice: 75,
          sellingValue: 1200,
          unitCost: 50,
          grossProfit: 450,
        },
      ],
    },
    {
      id: "sale-2",
      seriesName: "CHB",
      drSiNumber: "9806",
      receiptNumber: 2,
      businessDate: "2026-09-01",
      customer: "J8 Construction",
      cashier: "Cashier 2",
      status: "COMPLETED",
      total: 5700,
      refundTotal: 0,
      items: [
        {
          id: "item-2",
          name: "CHB 6",
          quantity: 300,
          unit: "Pcs",
          unitPrice: 19,
          basePrice: 18,
          sellingValue: 5700,
          unitCost: 12,
          grossProfit: 2100,
        },
      ],
    },
    {
      id: "sale-3",
      seriesName: "211",
      drSiNumber: null,
      receiptNumber: 3,
      businessDate: "2026-09-01",
      customer: "Cash",
      cashier: "Cashier 1",
      status: "COMPLETED",
      total: 300,
      refundTotal: 50,
      items: [
        {
          id: "item-3",
          name: "Mighty Bond",
          quantity: 1,
          unit: "Pc",
          unitPrice: 300,
          basePrice: null, // No custom base price, fallback to unitPrice
          sellingValue: 300,
          unitCost: 200,
          grossProfit: 100,
        },
      ],
    },
  ];

  it("calculates company breakdown totals for 211 and CHB, plus base and selling value", () => {
    const totals = calculateLedgerTotals(sampleSales, true);

    expect(totals.sales).toBe(3);
    expect(totals.grossRevenue).toBe(7200); // 1200 + 5700 + 300
    expect(totals.refunds).toBe(50);
    expect(totals.grossProfit).toBe(2650); // 450 + 2100 + 100

    // Company / Series breakdowns
    expect(totals.seriesTotals["211"]).toBe(1500); // 1200 + 300
    expect(totals.seriesTotals["CHB"]).toBe(5700);

    // Base value vs Selling value
    // sale-1: 15 * 75 = 1125 base, 1200 selling
    // sale-2: 300 * 18 = 5400 base, 5700 selling
    // sale-3: 1 * 300 = 300 base (fallback), 300 selling
    expect(totals.totalBaseValue).toBe(1125 + 5400 + 300); // 6825
    expect(totals.totalSellingValue).toBe(1200 + 5700 + 300); // 7200
  });

  it("formats CSV rows with DR/SI No. and Base Price matching spreadsheet structure", () => {
    const rows = formatLedgerCsvRows(sampleSales, true);

    // Check header contains DR / SI No. and Base Price
    const header = rows[0];
    expect(header).toContain("DR / SI No.");
    expect(header).toContain("Base Price");
    expect(header).toContain("Selling Price");
    expect(header).toContain("Customer");
    expect(header).toContain("Receipt");

    // Check row 1 has DR / SI No 9804 and basePrice 75
    const row1 = rows[1];
    expect(row1).toContain("Rayvill");
    expect(row1).toContain("211-000001");
    expect(row1).toContain("9804");
    expect(row1).toContain("White Sand");
    expect(row1).toContain("75");
    expect(row1).toContain("80");
  });

  it("redacts financial amounts in ledger totals and CSV when downloaded by staff", () => {
    const staffTotals = calculateLedgerTotals(sampleSales, false);
    expect(staffTotals.sales).toBe(3);
    expect(staffTotals.grossRevenue).toBe(0);
    expect(staffTotals.refunds).toBe(0);
    expect(staffTotals.grossProfit).toBe(0);
    expect(staffTotals.totalBaseValue).toBe(0);
    expect(staffTotals.totalSellingValue).toBe(0);
    expect(staffTotals.seriesTotals).toEqual({});

    const staffRows = formatLedgerCsvRows(sampleSales, false);
    const header = staffRows[0];
    expect(header).not.toContain("Base Price");
    expect(header).not.toContain("Selling Price");
    expect(header).not.toContain("Unit Cost");
    expect(header).not.toContain("Gross Profit");
    expect(header).not.toContain("Selling Value");
    expect(header).not.toContain("Sale Total");
    expect(header).not.toContain("Refund Total");
    expect(header).toContain("Qty");
    expect(header).toContain("Unit");
    expect(header).toContain("Item");

    // Row 1 should have item details but no prices
    const row1 = staffRows[1];
    expect(row1).toContain("Rayvill");
    expect(row1).toContain("White Sand");
    expect(row1).toContain("Bags");
    expect(row1).toContain("15");
    // Ensure no monetary fields are in the row
    expect(row1.split(",")).toHaveLength(header.split(",").length);
  });
});
