import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Explicit field allow-list — never expose cost, supplierId, or timestamps
// to this client-facing endpoint.
const PRODUCT_SELECT = {
  id: true,
  name: true,
  price: true,
  stock: true,
  unit: true,
  tag: true,
  quantityPrecision: true,
  lowStockThreshold: true,
  sku: true,
  barcode: true,
  category: true,
  imageUrl: true,
  packagings: {
    select: {
      id: true,
      name: true,
      conversionQty: true,
      price: true,
      barcode: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

function parseLimit(req: NextRequest): number {
  const raw = Number(req.nextUrl.searchParams.get("limit"));
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LIMIT;
  return Math.min(raw, MAX_LIMIT);
}

type ProductWithPackagings = {
  id: string;
  name: string;
  price: { toString(): string };
  stock: { toString(): string };
  unit: string;
  tag?: string | null;
  quantityPrecision: number;
  lowStockThreshold: { toString(): string };
  sku: string | null;
  barcode: string | null;
  category: string | null;
  imageUrl: string | null;
  packagings: Array<{
    id: string;
    name: string;
    conversionQty: { toString(): string };
    price: { toString(): string };
    barcode: string | null;
  }>;
};

function serializeProduct(p: ProductWithPackagings) {
  return {
    ...p,
    price: parseFloat(p.price.toString()),
    stock: parseFloat(p.stock.toString()),
    lowStockThreshold: parseFloat(p.lowStockThreshold?.toString() ?? "5"),
    packagings: p.packagings.map((pkg) => ({
      ...pkg,
      conversionQty: parseFloat(pkg.conversionQty.toString()),
      price: parseFloat(pkg.price.toString()),
    })),
  };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const take = parseLimit(req);

  if (!q.trim()) {
    const products = await prisma.product.findMany({
      where: { active: true },
      select: PRODUCT_SELECT,
      orderBy: { name: "asc" },
      take,
    });
    return NextResponse.json(products.map(serializeProduct));
  }

  // Also search packaging barcodes so scanning a box barcode resolves to the correct product
  const products = await prisma.product.findMany({
    where: {
      active: true,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { tag: { contains: q, mode: "insensitive" } },
        { barcode: { equals: q } },
        { packagings: { some: { barcode: { equals: q } } } },
      ],
    },
    select: PRODUCT_SELECT,
    take,
    orderBy: { name: "asc" },
  });

  return NextResponse.json(products.map(serializeProduct));
}
