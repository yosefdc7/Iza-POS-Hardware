import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import * as z from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const refundSchema = z.object({
  reason: z.string().max(500).optional(),
  restoreStock: z.boolean().default(true),
  items: z
    .array(
      z.object({
        saleItemId: z.string().min(1),
        quantity: z.number().finite().positive(),
      })
    )
    .min(1),
});

class RefundInputError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 = 400
  ) {
    super(message);
  }
}

function priorRefundQuantities(refunds: Array<{ items: unknown }>) {
  const quantities = new Map<string, number>();
  for (const refund of refunds) {
    if (!Array.isArray(refund.items)) continue;
    for (const entry of refund.items) {
      if (typeof entry !== "object" || entry === null) continue;
      const candidate = entry as { saleItemId?: unknown; quantity?: unknown };
      if (typeof candidate.saleItemId !== "string" || typeof candidate.quantity !== "number")
        continue;
      if (!Number.isFinite(candidate.quantity) || candidate.quantity <= 0) continue;
      quantities.set(
        candidate.saleItemId,
        (quantities.get(candidate.saleItemId) ?? 0) + candidate.quantity
      );
    }
  }
  return quantities;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: saleId } = await params;
  const parsed = refundSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const refund = await prisma.$transaction(async (tx) => {
      // Serialize refunds for this sale so two admins cannot refund the same units.
      await tx.$queryRaw`SELECT "id" FROM "Sale" WHERE "id" = ${saleId} FOR UPDATE`;
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: {
          items: true,
          refunds: { select: { items: true } },
        },
      });
      if (!sale) throw new RefundInputError("Sale not found", 404);
      if (sale.status !== "COMPLETED" && sale.status !== "PARTIALLY_REFUNDED") {
        throw new RefundInputError("Sale is not refundable");
      }

      const previous = priorRefundQuantities(sale.refunds);
      const seen = new Set<string>();
      const normalizedItems: Array<{
        saleItemId: string;
        productId: string | null;
        name: string;
        quantity: number;
        stockQuantity: number;
        price: number;
      }> = [];
      let refundAmount = 0;

      for (const requested of parsed.data.items) {
        if (seen.has(requested.saleItemId)) {
          throw new RefundInputError("Each sale item may be refunded only once per request");
        }
        seen.add(requested.saleItemId);

        const original = sale.items.find((item) => item.id === requested.saleItemId);
        if (!original) throw new RefundInputError("Sale item does not belong to this sale");
        const originalQuantity = Number(original.quantity);
        const alreadyRefunded = previous.get(original.id) ?? 0;
        const remaining = originalQuantity - alreadyRefunded;
        if (requested.quantity > remaining + 1e-7) {
          throw new RefundInputError(`Only ${Math.max(0, remaining)} units remain refundable`);
        }

        const price = parseFloat(original.price.toString());
        refundAmount += price * requested.quantity;
        normalizedItems.push({
          saleItemId: original.id,
          productId: original.productId,
          name: original.name,
          quantity: requested.quantity,
          stockQuantity: requested.quantity * Number(original.packagingQty ?? 1),
          price,
        });
      }

      const fullyRefunded = sale.items.every((item) => {
        const alreadyRefunded = previous.get(item.id) ?? 0;
        const requested =
          normalizedItems.find((entry) => entry.saleItemId === item.id)?.quantity ?? 0;
        return alreadyRefunded + requested >= Number(item.quantity) - 1e-7;
      });

      const created = await tx.refund.create({
        data: {
          saleId,
          userId: session.user.id,
          amount: refundAmount,
          reason: parsed.data.reason || null,
          items: normalizedItems,
          restoreStock: parsed.data.restoreStock,
        },
      });

      await tx.sale.update({
        where: { id: saleId },
        data: { status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED" },
      });

      if (parsed.data.restoreStock) {
        for (const item of normalizedItems) {
          if (!item.productId) continue;
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.stockQuantity } },
          });
        }
      }

      return created;
    });

    return NextResponse.json({ refund });
  } catch (error) {
    if (error instanceof RefundInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
