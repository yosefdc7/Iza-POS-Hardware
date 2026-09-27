export type LedgerRole = "ADMIN" | "CASHIER";
export type LedgerProtectedField = "unitCost" | "grossProfit" | "sellingValue";

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidBusinessDate(value: string): boolean {
  if (!BUSINESS_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function shiftBusinessDate(date: string, days: number): string {
  if (!isValidBusinessDate(date) || !Number.isInteger(days)) {
    throw new Error("Invalid business date");
  }
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function lastBusinessDateOfMonth(date: string): string {
  if (!isValidBusinessDate(date)) throw new Error("Invalid business date");
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function quantityFitsPrecision(quantity: number, precision: number): boolean {
  if (!Number.isFinite(quantity) || quantity <= 0) return false;
  if (!Number.isInteger(precision) || precision < 0 || precision > 4) return false;
  const factor = 10 ** precision;
  return Math.abs(quantity * factor - Math.round(quantity * factor)) <= 1e-7;
}

export function csvCell(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const text = value == null ? "" : String(value);
  const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safeText) ? `"${safeText.replace(/"/g, '""')}"` : safeText;
}

export function normalizeQuantity(quantity: number, precision: number): number {
  if (!Number.isInteger(precision) || precision < 0 || precision > 4) {
    throw new Error("Quantity precision must be an integer between 0 and 4");
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Quantity must be a positive finite number");
  }
  const factor = 10 ** precision;
  return Math.round((quantity + Number.EPSILON) * factor) / factor;
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function localMidnightToUtc(date: string, timeZone: string): Date {
  if (!isValidBusinessDate(date) || !isValidTimeZone(timeZone)) {
    throw new Error("Invalid business date or time zone");
  }
  const [year, month, day] = date.split("-").map(Number);
  let candidate = new Date(Date.UTC(year, month - 1, day));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = zonedParts(candidate, timeZone);
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    candidate = new Date(candidate.getTime() - (represented - Date.UTC(year, month - 1, day)));
  }
  return candidate;
}

export function businessDayUtcRange(date: string, timeZone: string) {
  const start = localMidnightToUtc(date, timeZone);
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const nextDate = next.toISOString().slice(0, 10);
  return { start, endExclusive: localMidnightToUtc(nextDate, timeZone) };
}

export function businessDateForInstant(instant: Date, timeZone: string) {
  if (!isValidTimeZone(timeZone)) throw new Error("Invalid time zone");
  const parts = zonedParts(instant, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function canViewLedgerField(role: LedgerRole, field: LedgerProtectedField) {
  return role === "ADMIN";
}

export function resolveLedgerScope(input: {
  role: LedgerRole;
  userId: string;
  today: string;
  requested: { from?: string | null; to?: string | null; cashierId?: string | null };
}) {
  if (input.role === "CASHIER") {
    return { from: input.today, to: input.today, cashierId: input.userId };
  }
  const from = input.requested.from || input.today;
  return { from, to: input.requested.to || from, cashierId: input.requested.cashierId || null };
}

export function formatReceiptReference(input: {
  seriesName?: string | null;
  receiptNumber?: number | null;
  legacyReference?: string | null;
  backfilled?: boolean;
}) {
  if (input.backfilled) {
    return {
      label: `LEGACY-${input.legacyReference ?? "UNKNOWN"}`,
      warning: "Backfilled estimate",
    };
  }
  return {
    label: `${input.seriesName ?? "UNASSIGNED"}-${String(input.receiptNumber ?? 0).padStart(6, "0")}`,
    warning: null,
  };
}

export interface LedgerItemData {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  basePrice?: number | null;
  unitCost?: number | null;
  sellingValue: number;
  grossProfit?: number | null;
}

export interface LedgerSaleData {
  id: string;
  seriesName?: string | null;
  drSiNumber?: string | null;
  receiptNumber?: number | null;
  legacyReference?: string | null;
  backfilled?: boolean;
  businessDate: string;
  customer: string;
  cashier: string;
  status: string;
  total: number;
  refundTotal: number;
  items: LedgerItemData[];
}

export interface LedgerCalculatedTotals {
  sales: number;
  grossRevenue: number;
  refunds: number;
  grossProfit: number;
  seriesTotals: Record<string, number>;
  totalBaseValue: number;
  totalSellingValue: number;
}

export function calculateLedgerTotals(
  sales: LedgerSaleData[],
  isAdmin: boolean
): LedgerCalculatedTotals {
  const seriesTotals: Record<string, number> = {};
  let totalBaseValue = 0;
  let totalSellingValue = 0;
  let grossProfit = 0;
  let grossRevenue = 0;
  let refunds = 0;

  for (const sale of sales) {
    if (isAdmin) {
      grossRevenue += sale.total;
      refunds += sale.refundTotal;

      const sName = sale.seriesName || "Other";
      seriesTotals[sName] = (seriesTotals[sName] || 0) + sale.total;
    }

    for (const item of sale.items) {
      if (isAdmin) {
        totalSellingValue += item.sellingValue;
        const effectiveBasePrice = item.basePrice ?? item.unitPrice;
        totalBaseValue += effectiveBasePrice * item.quantity;

        if (item.grossProfit != null) {
          grossProfit += item.grossProfit;
        }
      }
    }
  }

  return {
    sales: sales.length,
    grossRevenue: isAdmin ? grossRevenue : 0,
    refunds: isAdmin ? refunds : 0,
    grossProfit: isAdmin ? grossProfit : 0,
    seriesTotals: isAdmin ? seriesTotals : {},
    totalBaseValue: isAdmin ? totalBaseValue : 0,
    totalSellingValue: isAdmin ? totalSellingValue : 0,
  };
}

export function formatLedgerCsvRows(
  sales: LedgerSaleData[],
  isAdmin: boolean
): string[] {
  const columns = isAdmin
    ? [
        "Business Date",
        "Customer",
        "Receipt",
        "DR / SI No.",
        "Qty",
        "Unit",
        "Item",
        "Base Price",
        "Selling Price",
        "Unit Cost",
        "Gross Profit",
        "Selling Value",
        "Sale Total",
        "Refund Total",
        "Cashier",
        "Status",
      ]
    : [
        "Business Date",
        "Customer",
        "Receipt",
        "DR / SI No.",
        "Qty",
        "Unit",
        "Item",
        "Cashier",
        "Status",
      ];

  const rows = [columns.map(csvCell).join(",")];

  for (const sale of sales) {
    const receiptRef = formatReceiptReference({
      seriesName: sale.seriesName,
      receiptNumber: sale.receiptNumber,
      legacyReference: sale.legacyReference,
      backfilled: sale.backfilled,
    });

    for (const item of sale.items) {
      if (isAdmin) {
        const effectiveBasePrice = item.basePrice ?? item.unitPrice;
        rows.push(
          [
            sale.businessDate,
            sale.customer,
            receiptRef.label,
            sale.drSiNumber ?? "",
            item.quantity,
            item.unit,
            item.name,
            effectiveBasePrice,
            item.unitPrice,
            item.unitCost ?? "",
            item.grossProfit ?? "",
            item.sellingValue,
            sale.total,
            sale.refundTotal,
            sale.cashier,
            sale.status,
          ]
            .map(csvCell)
            .join(",")
        );
      } else {
        rows.push(
          [
            sale.businessDate,
            sale.customer,
            receiptRef.label,
            sale.drSiNumber ?? "",
            item.quantity,
            item.unit,
            item.name,
            sale.cashier,
            sale.status,
          ]
            .map(csvCell)
            .join(",")
        );
      }
    }
  }

  return rows;
}

