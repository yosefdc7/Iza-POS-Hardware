import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { quantityFitsPrecision } from "@/lib/daily-ledger";

const adjustSchema = z
  .object({
    productId: z.string(),
    delta: z.number().finite().optional(),
    quantity: z.number().finite().optional(),
    reason: z.enum(["RECEIVED", "DAMAGED", "THEFT", "CORRECTION", "OPENING_COUNT"]),
    note: z.string().optional(),
  })
  .refine(
    (data) => {
      const d = data.delta ?? data.quantity;
      return typeof d === "number" && d !== 0;
    },
    { message: "Adjustment delta cannot be zero", path: ["delta"] }
  );

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = adjustSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { productId, reason, note } = parsed.data;
  const delta = (parsed.data.delta ?? parsed.data.quantity)!;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { quantityPrecision: true },
      });
      if (!product) throw new Error("Product not found");
      if (!quantityFitsPrecision(Math.abs(delta), product.quantityPrecision)) {
        throw new Error(`Adjustment must use at most ${product.quantityPrecision} decimal places`);
      }

      const created = await tx.stockAdjustment.create({
        data: { productId, userId: session.user.id, delta, reason, note },
      });
      const updatedProduct = await tx.product.update({
        where: { id: productId },
        data: { stock: { increment: delta } },
        select: {
          id: true,
          name: true,
          stock: true,
          lowStockThreshold: true,
          unit: true,
        },
      });
      return { adjustment: created, updatedProduct };
    });

    const currentStock = parseFloat(result.updatedProduct.stock.toString());
    const threshold = parseFloat(result.updatedProduct.lowStockThreshold.toString());
    const isBelowThreshold = currentStock <= threshold;

    const lowStockAlert = isBelowThreshold
      ? {
          id: result.updatedProduct.id,
          name: result.updatedProduct.name,
          stock: currentStock,
          lowStockThreshold: threshold,
          unit: result.updatedProduct.unit,
          isOutOfStock: currentStock <= 0,
        }
      : null;

    return NextResponse.json({
      adjustment: result.adjustment,
      lowStockAlert,
      lowStockAlerts: lowStockAlert ? [lowStockAlert] : [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stock adjustment failed";
    if (message === "Product not found")
      return NextResponse.json({ error: message }, { status: 404 });
    if (message.includes("decimal places"))
      return NextResponse.json({ error: message }, { status: 400 });
    throw error;
  }
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const productId = req.nextUrl.searchParams.get("productId");

  const adjustments = await prisma.stockAdjustment.findMany({
    where: productId ? { productId } : undefined,
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ adjustments });
}
