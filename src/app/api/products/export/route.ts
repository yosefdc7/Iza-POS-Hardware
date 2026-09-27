import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { csvCell } from "@/lib/daily-ledger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "ADMIN";
  const { searchParams } = new URL(request.url);
  const tagFilter = searchParams.get("tag");

  const where: any = {};
  if (tagFilter && tagFilter !== "ALL") {
    if (tagFilter === "UNTAGGED") {
      where.OR = [{ tag: null }, { tag: "" }];
    } else {
      where.tag = tagFilter;
    }
  }

  const products = await prisma.product.findMany({
    where,
    include: {
      packagings: { orderBy: { createdAt: "asc" } },
      supplier: { select: { name: true } },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  const columns = [
    "Product ID",
    "Name",
    "Tag",
    "Category",
    "SKU",
    "Barcode",
    "Stock",
    "Unit",
    "Packaging Name",
    "Packaging Ratio",
    ...(isAdmin ? ["Packaging Price", "Selling Price", "Cost Price", "Gross Margin %"] : []),
    "Low Stock Threshold",
    "Supplier",
    "Status",
  ];

  const rows: string[] = [columns.map(csvCell).join(",")];

  for (const product of products) {
    const stockNum = parseFloat(String(product.stock));
    const priceNum = parseFloat(String(product.price));
    const costNum = product.cost ? parseFloat(String(product.cost)) : null;
    const margin = costNum !== null && priceNum > 0
      ? `${Math.round(((priceNum - costNum) / priceNum) * 1000) / 10}%`
      : "";

    const primaryPack = product.packagings?.[0];
    const packName = primaryPack?.name ?? "";
    const packRatio = primaryPack ? String(primaryPack.conversionQty) : "";
    const packPrice = primaryPack ? parseFloat(String(primaryPack.price)).toFixed(2) : "";

    rows.push(
      [
        product.id,
        product.name,
        product.tag ?? "",
        product.category ?? "",
        product.sku ?? "",
        product.barcode ?? "",
        stockNum,
        product.unit || "pc",
        packName,
        packRatio,
        ...(isAdmin ? [packPrice, priceNum.toFixed(2), costNum !== null ? costNum.toFixed(2) : "", margin] : []),
        parseFloat(String(product.lowStockThreshold)),
        product.supplier?.name ?? "",
        product.active ? "Active" : "Inactive",
      ]
        .map(csvCell)
        .join(",")
    );
  }

  const csv = rows.join("\n");
  const dateStr = new Date().toISOString().split("T")[0];

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="products-export-${dateStr}.csv"`,
    },
  });
}
