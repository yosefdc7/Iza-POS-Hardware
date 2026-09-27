import {lockCheckoutProducts,validateCheckoutStock} from "@/lib/checkout-stock";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { pluginRegistry } from "@/lib/plugins";
import { quantityFitsPrecision } from "@/lib/daily-ledger";
import { findSaleRetry, fingerprintSale, SaleRetryConflict } from "@/lib/sale-idempotency";

const saleSchema = z.object({
  originatingUserId: z.string().optional(),
  clientRequestId: z.string().uuid().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        // Kept for queue/client compatibility; the server derives both from Product.
        name: z.string().optional(),
        price: z.number().finite().optional(),
        quantity: z.number().finite().positive(),
        notes: z.string().optional(),
        /** Optional packaging ID. When present, stock is deducted in base units (quantity × conversionQty). */
        packagingId: z.string().optional(),
      })
    )
    .min(1),
  // Optional keeps older queued payloads replayable; the first active series is used.
  receiptSeriesId: z.string().min(1).optional(),
  paymentMethod: z.enum(["CASH", "CARD", "OTHER"]).default("CASH"),
  amountTendered: z.number().finite().nonnegative().optional(),
  paymentLines: z
    .array(
      z.object({
        method: z.enum(["CASH", "CARD", "OTHER"]),
        amount: z.number().finite().min(0),
      })
    )
    .optional(),
  tipAmount: z.number().finite().min(0).default(0),
  taxRate: z.number().finite().min(0).max(1).default(0),
  discountAmount: z.number().finite().min(0).default(0),
  discountType: z.enum(["fixed", "percent"]).default("fixed"),
  note: z.string().optional(),
  customerId: z.string().optional(),
  drSiNumber: z.string().trim().optional(),
  /** Loyalty points to redeem as discount (0 = no redemption) */
  loyaltyPointsUsed: z.number().int().min(0).default(0),
});

class SaleInputError extends Error {}
class ReceiptSeriesUnavailableError extends Error {}

type LoyaltySettings = { enabled: boolean; earnRate: number; redeemValue: number };

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = saleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.originatingUserId && parsed.data.originatingUserId !== session.user.id) return NextResponse.json({ error: "Sign in as the original cashier to submit this sale" }, { status: 409 });
  const {
    items,
    receiptSeriesId,
    paymentMethod,
    amountTendered,
    paymentLines,
    tipAmount,
    taxRate,
    discountAmount,
    discountType,
    note,
    customerId,
    drSiNumber,
    loyaltyPointsUsed,
  } = parsed.data;

  const effectiveMethod: "CASH" | "CARD" | "OTHER" =
    paymentLines && paymentLines.length > 0
      ? paymentLines.reduce((a, b) => (a.amount >= b.amount ? a : b)).method
      : paymentMethod;
  const paidTotal =
    paymentLines && paymentLines.length > 0
      ? paymentLines.reduce((sum, line) => sum + line.amount, 0)
      : (amountTendered ?? 0);

  let loyaltySettings: LoyaltySettings | null = null;
  if (customerId) {
    const settings = await prisma.businessSettings.findUnique({ where: { id: "singleton" } });
    if (settings?.loyaltyEnabled) {
      loyaltySettings = {
        enabled: true,
        earnRate: parseFloat(settings.loyaltyEarnRate.toString()),
        redeemValue: parseFloat(settings.loyaltyRedeemValue.toString()),
      };
    }
  }

  try {
    const requestFingerprint = fingerprintSale(parsed.data);
    let replayed = false;
    const sale = await prisma.$transaction(async (tx) => {
      if (parsed.data.clientRequestId) {
        const existing = await findSaleRetry(tx, parsed.data.clientRequestId, session.user.id, requestFingerprint);
        if (existing) { replayed = true; return existing; }
      }
      const issued = receiptSeriesId
        ? await tx.$queryRaw<Array<{ id: string; name: string; receiptNumber: number }>>`
            UPDATE "ReceiptSeries"
            SET "nextNumber" = "nextNumber" + 1, "updatedAt" = NOW()
            WHERE "id" = ${receiptSeriesId} AND "active" = true
            RETURNING "id", "name", "nextNumber" - 1 AS "receiptNumber"
          `
        : await tx.$queryRaw<Array<{ id: string; name: string; receiptNumber: number }>>`
            UPDATE "ReceiptSeries"
            SET "nextNumber" = "nextNumber" + 1, "updatedAt" = NOW()
            WHERE "id" = (
              SELECT "id" FROM "ReceiptSeries"
              WHERE "active" = true
              ORDER BY "name" ASC
              LIMIT 1
            )
            RETURNING "id", "name", "nextNumber" - 1 AS "receiptNumber"
          `;
      if (issued.length !== 1) throw new ReceiptSeriesUnavailableError();

      const products = await lockCheckoutProducts(tx,items.map(item=>item.productId));
      const productMap = new Map(products.map((product) => [product.id, product] as const));

      // Resolve packaging for each item and validate stock
      const normalizedItems = items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) throw new SaleInputError(`Product not found: ${item.productId}`);
        if (!product.active) throw new SaleInputError(`${product.name} is inactive`);
        if (!quantityFitsPrecision(item.quantity, product.quantityPrecision)) {
          throw new SaleInputError(
            `${product.name} allows at most ${product.quantityPrecision} decimal places`
          );
        }

        let packagingId: string | undefined;
        let packagingQty: number | undefined;
        let unitPrice: number;
        let stockDeduction: number;
        const basePrice = parseFloat(product.price.toString());

        if (item.packagingId) {
          const pkg = product.packagings.find((p) => p.id === item.packagingId);
          if (!pkg) throw new SaleInputError(`Packaging not found for ${product.name}`);
          packagingId = pkg.id;
          packagingQty = parseFloat(pkg.conversionQty.toString());
          unitPrice = parseFloat(pkg.price.toString());
          stockDeduction = item.quantity * packagingQty;

          // Stock validation: block sale if insufficient base units
          const currentStock = parseFloat(product.stock.toString());
          if (stockDeduction > currentStock + 1e-7) {
            throw new SaleInputError(
              `Insufficient stock for ${product.name} (${pkg.name}): ` +
                `requires ${stockDeduction} ${product.unit}s, only ${currentStock} available`
            );
          }
        } else {
          unitPrice = basePrice;
          stockDeduction = item.quantity;
        }

        return {
          productId: product.id,
          name: product.name,
          price: unitPrice,
          basePrice,
          quantity: item.quantity,
          unit: product.unit,
          unitCost: product.cost == null ? null : parseFloat(product.cost.toString()),
          notes: item.notes,
          packagingId,
          packagingQty,
          stockDeduction,
        };
      });
      try {validateCheckoutStock(products,normalizedItems);} catch(error) {throw new SaleInputError(error instanceof Error?error.message:'Insufficient stock');}


      let customer: { loyaltyPoints: number } | null = null;
      if (customerId) {
        // Validate and lock the customer so concurrent redemptions cannot
        // both pass the points-balance check before decrementing it.
        await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${customerId} FOR UPDATE`;
        customer = await tx.customer.findUnique({
          where: { id: customerId },
          select: { loyaltyPoints: true },
        });
        if (!customer) throw new SaleInputError("Customer not found");
      }

      const subtotal = normalizedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const discountValue =
        discountType === "percent"
          ? (subtotal * discountAmount) / 100
          : Math.min(discountAmount, subtotal);

      if (
        loyaltyPointsUsed > 0 &&
        (!customerId ||
          !loyaltySettings?.enabled ||
          !Number.isFinite(loyaltySettings.redeemValue) ||
          loyaltySettings.redeemValue <= 0)
      ) {
        throw new SaleInputError("Loyalty redemption requires an enabled customer account");
      }

      let loyaltyDiscount = 0;
      if (loyaltySettings?.enabled && loyaltyPointsUsed > 0) {
        if (!customer) throw new SaleInputError("Customer not found");
        if (loyaltyPointsUsed > customer.loyaltyPoints) {
          throw new SaleInputError("Insufficient loyalty points");
        }
        loyaltyDiscount = Math.min(
          loyaltyPointsUsed / loyaltySettings.redeemValue,
          Math.max(0, subtotal - discountValue)
        );
      }

      const totalDiscount = Math.min(subtotal, discountValue + loyaltyDiscount);
      const taxAmt = (subtotal - totalDiscount) * taxRate;
      const total = subtotal - totalDiscount + taxAmt + tipAmount;
      const paidForCash =
        paymentLines && paymentLines.length > 0
          ? paidTotal
          : paymentMethod === "CASH"
            ? (amountTendered ?? total)
            : 0;
      if (
        (paymentLines && paymentLines.length > 0 && paidTotal + 1e-7 < total) ||
        (!paymentLines?.length && paymentMethod === "CASH" && paidForCash + 1e-7 < total)
      ) {
        throw new SaleInputError("Payment is less than the sale total");
      }
      const changeDue =
        effectiveMethod === "CASH" || paymentLines?.some((line) => line.method === "CASH")
          ? Math.max(0, paidForCash - total)
          : undefined;

      const created = await tx.sale.create({
        data: {
          clientRequestId: parsed.data.clientRequestId,
          requestFingerprint: parsed.data.clientRequestId ? requestFingerprint : null,
          userId: session.user.id,
          receiptSeriesId: issued[0].id,
          receiptNumber: issued[0].receiptNumber,
          customerId: customerId || undefined,
          drSiNumber: drSiNumber || undefined,
          subtotal,
          taxRate,
          taxAmount: taxAmt,
          discountAmount: totalDiscount,
          tipAmount,
          total,
          paymentMethod: effectiveMethod,
          paymentLines: paymentLines && paymentLines.length > 0 ? paymentLines : undefined,
          amountTendered:
            amountTendered ??
            (paymentMethod === "CASH" ? total : paidTotal > 0 ? paidTotal : undefined),
          changeDue,
          notes: note,
          items: {
            create: normalizedItems.map((item) => ({
              productId: item.productId,
              name: item.name,
              price: item.price,
              basePrice: item.basePrice,
              quantity: item.quantity,
              unit: item.unit,
              unitCost: item.unitCost,
              total: item.price * item.quantity,
              notes: item.notes,
              packagingId: item.packagingId ?? null,
              packagingQty: item.packagingQty ?? null,
            })),
          },
        },
        include: { items: true },
      });

      for (const item of normalizedItems) {
        await tx.product.update({
          where: { id: item.productId },
          // stockDeduction = quantity × conversionQty for packaged items, or quantity for base items
          data: { stock: { decrement: item.stockDeduction } },
        });
      }

      if (customerId && loyaltySettings?.enabled) {
        const earnedPoints = Math.floor(Math.max(0, total) * loyaltySettings.earnRate);
        const logs: Array<{
          customerId: string;
          saleId: string;
          delta: number;
          type: "EARN" | "REDEEM" | "ADJUST";
          note: string;
        }> = [];

        if (loyaltyPointsUsed > 0) {
          await tx.customer.update({
            where: { id: customerId },
            data: { loyaltyPoints: { decrement: loyaltyPointsUsed } },
          });
          logs.push({
            customerId,
            saleId: created.id,
            delta: -loyaltyPointsUsed,
            type: "REDEEM",
            note: `Redeemed ${loyaltyPointsUsed} pts`,
          });
        }
        if (earnedPoints > 0) {
          await tx.customer.update({
            where: { id: customerId },
            data: { loyaltyPoints: { increment: earnedPoints } },
          });
          logs.push({
            customerId,
            saleId: created.id,
            delta: earnedPoints,
            type: "EARN",
            note: "Earned on sale",
          });
        }
        for (const log of logs) await tx.loyaltyLog.create({ data: log });
      }

      return created;
    });

    if (replayed) return NextResponse.json({ sale, lowStockAlerts: [] }, { status: 200 });

    pluginRegistry
      .fire("onSaleComplete", {
        saleId: sale.id,
        total: parseFloat(sale.total.toString()),
        taxAmount: parseFloat(sale.taxAmount?.toString() ?? "0"),
        tipAmount: parseFloat(sale.tipAmount?.toString() ?? "0"),
        items: sale.items.map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: parseFloat(item.quantity.toString()),
          price: parseFloat(item.price.toString()),
        })),
        customerId: sale.customerId ?? null,
        paymentMethod: sale.paymentMethod,
        loyaltyPointsUsed,
      })
      .catch(() => {
        /* handled inside fire() */
      });

    // Detect products whose stock level has dropped to or below their lowStockThreshold
    let lowStockAlerts: Array<{
      id: string;
      name: string;
      stock: number;
      lowStockThreshold: number;
      unit: string;
      isOutOfStock: boolean;
    }> = [];

    try {
      const updatedProducts = await prisma.product.findMany({
        where: {
          id: { in: items.map((i) => i.productId) },
          active: true,
        },
        select: {
          id: true,
          name: true,
          stock: true,
          lowStockThreshold: true,
          unit: true,
        },
      });

      lowStockAlerts = updatedProducts
        .filter((p) => parseFloat(p.stock.toString()) <= parseFloat(p.lowStockThreshold.toString()))
        .map((p) => ({
          id: p.id,
          name: p.name,
          stock: parseFloat(p.stock.toString()),
          lowStockThreshold: parseFloat(p.lowStockThreshold.toString()),
          unit: p.unit,
          isOutOfStock: parseFloat(p.stock.toString()) <= 0,
        }));
    } catch {
      // Best-effort stock alert detection
    }

    return NextResponse.json({ sale, lowStockAlerts }, { status: 201 });
  } catch (error) {
    if (error instanceof SaleRetryConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof SaleInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ReceiptSeriesUnavailableError) {
      return NextResponse.json({ error: "Select an active receipt series" }, { status: 409 });
    }
    throw error;
  }
}
