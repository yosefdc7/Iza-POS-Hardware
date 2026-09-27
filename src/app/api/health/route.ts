import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const tables = await prisma.$queryRaw<Array<{ name: string }>>`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public'`;
    const required = ["User", "Account", "Session", "Verification", "BusinessSettings", "ReceiptSeries", "Product", "ProductPackaging", "Sale", "SaleItem", "Customer", "HeldOrder", "LoyaltyLog", "StockAdjustment", "Supplier", "Refund"];
    if (required.some(name => !tables.some(table => table.name === name))) throw new Error("Schema incomplete");
    await prisma.$queryRaw`SELECT "clientRequestId", "requestFingerprint" FROM "Sale" LIMIT 0`;
    await prisma.$queryRaw`SELECT "packagingId", "packagingQty", "basePrice" FROM "SaleItem" LIMIT 0`;
    return NextResponse.json({ status: "healthy" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
