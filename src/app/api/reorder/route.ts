import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { groupReorderItemsBySupplier, type ReorderProduct } from "@/lib/reorder";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const multiplier = parseFloat(searchParams.get("multiplier") || "1") || 1;
    const supplierFilter = searchParams.get("supplierId") || undefined;
    const search = searchParams.get("search")?.toLowerCase().trim() || "";

    const [products, rawSettings] = await Promise.all([
      prisma.product.findMany({
        where: {
          active: true,
          ...(supplierFilter && supplierFilter !== "all"
            ? supplierFilter === "unassigned"
              ? { supplierId: null }
              : { supplierId: supplierFilter }
            : {}),
        },
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
              contactName: true,
              email: true,
              phone: true,
              notes: true,
            },
          },
        },
        orderBy: [{ stock: "asc" }, { name: "asc" }],
      }),
      prisma.businessSettings.findUnique({ where: { id: "singleton" } }).catch(() => null),
    ]);

    // Filter products currently at or below their low-stock threshold
    const lowStockRaw = products.filter((p) => {
      const stock = Number(p.stock) || 0;
      const threshold = Number(p.lowStockThreshold) || 0;
      return stock <= threshold;
    });

    // If search filter is active, filter by name, sku, barcode, category
    const filteredProducts = search
      ? lowStockRaw.filter(
          (p) =>
            p.name.toLowerCase().includes(search) ||
            (p.sku && p.sku.toLowerCase().includes(search)) ||
            (p.barcode && p.barcode.toLowerCase().includes(search)) ||
            (p.category && p.category.toLowerCase().includes(search)) ||
            (p.supplier && p.supplier.name.toLowerCase().includes(search))
        )
      : lowStockRaw;

    const mappedProducts: ReorderProduct[] = filteredProducts.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      category: p.category,
      unit: p.unit || "pcs",
      stock: Number(p.stock) || 0,
      lowStockThreshold: Number(p.lowStockThreshold) || 0,
      cost: p.cost !== null && p.cost !== undefined ? Number(p.cost) : null,
      price: Number(p.price) || 0,
      supplierId: p.supplierId,
      supplier: p.supplier
        ? {
            id: p.supplier.id,
            name: p.supplier.name,
            contactPerson: p.supplier.contactName,
            email: p.supplier.email,
            phone: p.supplier.phone,
            address: p.supplier.notes,
          }
        : null,
    }));

    const { groups, summary } = groupReorderItemsBySupplier(mappedProducts, multiplier);

    // Get list of all suppliers for the filter dropdown
    const allSuppliers = await prisma.supplier.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      products: mappedProducts,
      supplierGroups: groups,
      summary,
      suppliers: allSuppliers,
      settings: {
        name: rawSettings?.name || "Izah Store",
        currency: rawSettings?.currency || "₱",
        taxName: rawSettings?.taxName || "VAT",
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Reorder API] Failed to fetch reorder list:", error);
    return NextResponse.json(
      {
        error: "Failed to load reorder list",
        products: [],
        supplierGroups: [],
        summary: {
          totalLowStockCount: 0,
          outOfStockCount: 0,
          totalSuggestedUnits: 0,
          totalEstimatedCost: 0,
          supplierCount: 0,
        },
        suppliers: [],
        settings: null,
      },
      { status: 500 }
    );
  }
}
