import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  businessDateForInstant,
  businessDayUtcRange,
  csvCell,
  isValidBusinessDate,
  isValidTimeZone,
  formatReceiptReference,
  resolveLedgerScope,
  calculateLedgerTotals,
  formatLedgerCsvRows,
  type LedgerSaleData,
} from "@/lib/daily-ledger";

const ledgerQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  seriesId: z.string().optional(),
  cashierId: z.string().optional(),
  status: z.enum(["COMPLETED", "VOIDED", "REFUNDED", "PARTIALLY_REFUNDED"]).optional(),
  q: z.string().trim().default(""),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  format: z.enum(["csv", "print"]).optional(),
});

const saleInclude = {
  receiptSeries: { select: { id: true, name: true } },
  user: { select: { id: true, name: true } },
  customer: { select: { name: true } },
  items: {
    select: {
      id: true,
      name: true,
      quantity: true,
      unit: true,
      unitCost: true,
      price: true,
      basePrice: true,
      total: true,
    },
  },
  refunds: { select: { amount: true } },
} satisfies Prisma.SaleInclude;

async function fetchAllSales(where: Prisma.SaleWhereInput) {
  const all: Array<Prisma.SaleGetPayload<{ include: typeof saleInclude }>> = [];
  const batchSize = 500;
  let skip = 0;
  while (true) {
    const batch = await prisma.sale.findMany({
      where,
      include: saleInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: batchSize,
    });
    all.push(...batch);
    if (batch.length < batchSize) return all;
    skip += batch.length;
  }
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const query = ledgerQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!query.success) {
    return NextResponse.json({ error: query.error.flatten() }, { status: 400 });
  }

  const settings = await prisma.businessSettings.findUnique({
    where: { id: "singleton" },
    select: { businessTimezone: true },
  });
  const timeZone = isValidTimeZone(settings?.businessTimezone ?? "")
    ? (settings?.businessTimezone ?? "Asia/Manila")
    : "Asia/Manila";
  const isAdmin = session.user.role === "ADMIN";
  const today = businessDateForInstant(new Date(), timeZone);
  const scope = resolveLedgerScope({
    role: isAdmin ? "ADMIN" : "CASHIER",
    userId: session.user.id,
    today,
    requested: {
      from: query.data.from,
      to: query.data.to,
      cashierId: query.data.cashierId,
    },
  });

  if (!isValidBusinessDate(scope.from) || !isValidBusinessDate(scope.to) || scope.from > scope.to) {
    return NextResponse.json({ error: "Invalid report date range" }, { status: 400 });
  }

  const start = businessDayUtcRange(scope.from, timeZone).start;
  const endExclusive = businessDayUtcRange(scope.to, timeZone).endExclusive;
  const where: Prisma.SaleWhereInput = {
    createdAt: { gte: start, lt: endExclusive },
    ...(isAdmin && query.data.seriesId ? { receiptSeriesId: query.data.seriesId } : {}),
    ...(scope.cashierId ? { userId: scope.cashierId } : {}),
    ...(isAdmin && query.data.status ? { status: query.data.status } : {}),
  };
  if (query.data.q) {
    const receiptNumber = Number(query.data.q);
    where.OR = [
      { legacyReference: { contains: query.data.q, mode: "insensitive" } },
      { customer: { is: { name: { contains: query.data.q, mode: "insensitive" } } } },
      { items: { some: { name: { contains: query.data.q, mode: "insensitive" } } } },
      ...(Number.isSafeInteger(receiptNumber) ? [{ receiptNumber }] : []),
    ];
  }

  const isCsv = query.data.format === "csv";
  const isPrint = query.data.format === "print";
  const page = isCsv || isPrint ? 1 : query.data.page;
  const pageSize = isCsv || isPrint ? 500 : query.data.pageSize;
  const salesPromise =
    isCsv || isPrint
      ? fetchAllSales(where)
      : prisma.sale.findMany({
          where,
          include: saleInclude,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        });

  const [totalCount, rawSales, series, cashiers] = await Promise.all([
    prisma.sale.count({ where }),
    salesPromise,
    isAdmin ? prisma.receiptSeries.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    isAdmin
      ? prisma.user.findMany({
          where: { role: { in: ["ADMIN", "CASHIER"] } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const sales = rawSales.map((sale) => {
    const receipt = formatReceiptReference({
      seriesName: sale.receiptSeries?.name,
      receiptNumber: sale.receiptNumber,
      legacyReference: sale.legacyReference,
      backfilled: sale.backfilled,
    });
    const items = sale.items.map((item) => {
      const quantity = parseFloat(item.quantity.toString());
      const sellingValue = parseFloat(item.total.toString());
      const unitCost = item.unitCost == null ? null : parseFloat(item.unitCost.toString());
      const unitPrice = parseFloat(item.price.toString());
      const basePrice = item.basePrice == null ? null : parseFloat(item.basePrice.toString());
      return {
        id: item.id,
        name: item.name,
        quantity,
        unit: item.unit,
        unitPrice: isAdmin ? unitPrice : 0,
        basePrice: isAdmin ? basePrice : null,
        sellingValue: isAdmin ? sellingValue : 0,
        ...(isAdmin
          ? { unitCost, grossProfit: unitCost == null ? null : sellingValue - unitCost * quantity }
          : {}),
      };
    });
    const refundTotal = sale.refunds.reduce(
      (sum, refund) => sum + parseFloat(refund.amount.toString()),
      0
    );
    return {
      id: sale.id,
      receipt,
      seriesName: sale.receiptSeries?.name,
      receiptNumber: sale.receiptNumber,
      legacyReference: sale.legacyReference,
      backfilled: sale.backfilled,
      drSiNumber: sale.drSiNumber,
      createdAt: sale.createdAt,
      businessDate: businessDateForInstant(sale.createdAt, timeZone),
      customer: sale.customer?.name ?? "Cash",
      cashier: sale.user.name,
      status: sale.status,
      total: isAdmin ? parseFloat(sale.total.toString()) : 0,
      refundTotal: isAdmin ? refundTotal : 0,
      items,
    };
  });

  const totals = calculateLedgerTotals(sales as LedgerSaleData[], isAdmin);

  if (isCsv) {
    const rows = formatLedgerCsvRows(sales as LedgerSaleData[], isAdmin);
    if (sales.some((sale) => sale.receipt.warning)) {
      rows.push(
        csvCell(
          "Backfilled estimate: legacy receipt references, units, and costs are approximations."
        )
      );
    }
    return new NextResponse(rows.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="daily-sales-ledger-${scope.from}-to-${scope.to}.csv"`,
      },
    });
  }

  return NextResponse.json({
    sales,
    totals,
    series,
    cashiers,
    page,
    pageSize: isPrint ? Math.max(1, totalCount) : pageSize,
    totalCount,
    timeZone,
    from: scope.from,
    to: scope.to,
    isAdmin,
  });
}
