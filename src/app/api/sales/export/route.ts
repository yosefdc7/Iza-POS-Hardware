import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  businessDateForInstant,
  businessDayUtcRange,
  csvCell,
  isValidBusinessDate,
  isValidTimeZone,
  resolveLedgerScope,
} from "@/lib/daily-ledger";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const settings = await prisma.businessSettings.findUnique({
    where: { id: "singleton" },
    select: { businessTimezone: true },
  });
  const timeZone = isValidTimeZone(settings?.businessTimezone ?? "")
    ? (settings?.businessTimezone ?? "Asia/Manila")
    : "Asia/Manila";
  const isAdmin = session.user.role === "ADMIN";
  const today = businessDateForInstant(new Date(), timeZone);
  const scope = isAdmin
    ? {
        from: searchParams.get("from"),
        to: searchParams.get("to"),
        cashierId: null,
      }
    : resolveLedgerScope({
        role: "CASHIER",
        userId: session.user.id,
        today,
        requested: { from: searchParams.get("from"), to: searchParams.get("to") },
      });

  if (
    (scope.from !== null && !isValidBusinessDate(scope.from)) ||
    (scope.to !== null && !isValidBusinessDate(scope.to)) ||
    (scope.from !== null && scope.to !== null && scope.from > scope.to)
  ) {
    return NextResponse.json({ error: "Invalid report date range" }, { status: 400 });
  }

  const dateFilter: Prisma.DateTimeFilter = {};
  if (scope.from) dateFilter.gte = businessDayUtcRange(scope.from, timeZone).start;
  if (scope.to) dateFilter.lt = businessDayUtcRange(scope.to, timeZone).endExclusive;

  const where: Prisma.SaleWhereInput = {
    ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
    ...(scope.cashierId ? { userId: scope.cashierId } : {}),
  };

  const sales = await prisma.sale.findMany({
    where,
    include: {
      items: { select: { quantity: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Build CSV
  const columns = isAdmin
    ? [
        "Sale ID",
        "Business Date",
        "Status",
        "Payment Method",
        "Subtotal",
        "Discount",
        "Tax",
        "Total",
        "Total Quantity",
        "Items",
      ]
    : [
        "Sale ID",
        "Business Date",
        "Status",
        "Payment Method",
        "Items Count",
        "Total Quantity",
        "Items",
      ];

  const rows: string[] = [columns.map(csvCell).join(",")];

  for (const sale of sales) {
    const totalQty = sale.items.reduce((sum, item) => sum + Number(item.quantity), 0);
    const itemsSummary = sale.items
      .map((i: (typeof sale.items)[number]) => `${i.quantity}x ${i.name}`)
      .join("; ");

    if (isAdmin) {
      rows.push(
        [
          sale.id,
          businessDateForInstant(sale.createdAt, timeZone),
          sale.status,
          sale.paymentMethod,
          sale.subtotal.toFixed(2),
          sale.discountAmount.toFixed(2),
          sale.taxAmount.toFixed(2),
          sale.total.toFixed(2),
          totalQty.toString(),
          itemsSummary,
        ]
          .map(csvCell)
          .join(",")
      );
    } else {
      rows.push(
        [
          sale.id,
          businessDateForInstant(sale.createdAt, timeZone),
          sale.status,
          sale.paymentMethod,
          sale.items.length.toString(),
          totalQty.toString(),
          itemsSummary,
        ]
          .map(csvCell)
          .join(",")
      );
    }
  }

  const csv = rows.join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="sales-export-${scope.from ?? "all"}-to-${scope.to ?? "all"}.csv"`,
    },
  });
}
