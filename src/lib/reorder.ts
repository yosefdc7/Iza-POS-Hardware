export interface ReorderProduct {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  unit: string;
  stock: number;
  lowStockThreshold: number;
  cost: number | null;
  price: number;
  supplierId: string | null;
  supplier: {
    id: string;
    name: string;
    contactPerson: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  } | null;
}

export interface ReorderItemCalculated extends ReorderProduct {
  suggestedQty: number;
  unitCost: number;
  totalCost: number;
  isOutOfStock: boolean;
  stockDeficit: number;
}

export interface SupplierOrderGroup {
  supplierId: string;
  supplierName: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  items: ReorderItemCalculated[];
  totalUnits: number;
  totalEstimatedCost: number;
}

export interface ReorderSummary {
  totalLowStockCount: number;
  outOfStockCount: number;
  totalSuggestedUnits: number;
  totalEstimatedCost: number;
  supplierCount: number;
}

/**
 * Calculates suggested reorder quantity based on low stock threshold, current stock, and safety multiplier.
 * Suggested Qty = Math.max(1, Math.ceil(threshold * multiplier - currentStock))
 */
export function calculateSuggestedReorderQty(
  stock: number,
  threshold: number,
  multiplier: number = 1
): number {
  const current = Number(stock) || 0;
  const thresh = Number(threshold) || 1;
  const mult = Math.max(1, Number(multiplier) || 1);

  const targetLevel = Math.ceil(thresh * mult);
  const diff = targetLevel - current;

  return diff > 0 ? diff : 1;
}

/**
 * Groups and calculates reorder items into supplier purchase orders.
 */
export function groupReorderItemsBySupplier(
  products: ReorderProduct[],
  multiplier: number = 1,
  customQtyOverrides: Record<string, number> = {}
): {
  groups: SupplierOrderGroup[];
  summary: ReorderSummary;
} {
  const supplierMap = new Map<string, SupplierOrderGroup>();

  let totalLowStockCount = 0;
  let outOfStockCount = 0;
  let totalSuggestedUnits = 0;
  let totalEstimatedCost = 0;

  for (const prod of products) {
    const stock = Number(prod.stock) || 0;
    const threshold = Number(prod.lowStockThreshold) || 0;
    const unitCost = prod.cost !== null && prod.cost !== undefined ? Number(prod.cost) : Number(prod.price) * 0.7; // fallback est. 70% of retail if cost not set

    const suggestedQty =
      customQtyOverrides[prod.id] !== undefined
        ? Math.max(0, customQtyOverrides[prod.id])
        : calculateSuggestedReorderQty(stock, threshold, multiplier);

    const isOutOfStock = stock <= 0;
    const stockDeficit = Math.max(0, threshold - stock);
    const itemTotalCost = suggestedQty * unitCost;

    totalLowStockCount += 1;
    if (isOutOfStock) outOfStockCount += 1;
    totalSuggestedUnits += suggestedQty;
    totalEstimatedCost += itemTotalCost;

    const calculatedItem: ReorderItemCalculated = {
      ...prod,
      stock,
      lowStockThreshold: threshold,
      suggestedQty,
      unitCost,
      totalCost: itemTotalCost,
      isOutOfStock,
      stockDeficit,
    };

    const sId = prod.supplier?.id || "unassigned";
    const sName = prod.supplier?.name || "Unassigned Supplier (No Vendor Linked)";

    if (!supplierMap.has(sId)) {
      supplierMap.set(sId, {
        supplierId: sId,
        supplierName: sName,
        contactPerson: prod.supplier?.contactPerson ?? null,
        email: prod.supplier?.email ?? null,
        phone: prod.supplier?.phone ?? null,
        address: prod.supplier?.address ?? null,
        items: [],
        totalUnits: 0,
        totalEstimatedCost: 0,
      });
    }

    const group = supplierMap.get(sId)!;
    group.items.push(calculatedItem);
    group.totalUnits += suggestedQty;
    group.totalEstimatedCost += itemTotalCost;
  }

  // Sort groups: named suppliers first alphabetically, unassigned last
  const groups = Array.from(supplierMap.values()).sort((a, b) => {
    if (a.supplierId === "unassigned") return 1;
    if (b.supplierId === "unassigned") return -1;
    return a.supplierName.localeCompare(b.supplierName);
  });

  const supplierCount = groups.filter((g) => g.supplierId !== "unassigned").length;

  return {
    groups,
    summary: {
      totalLowStockCount,
      outOfStockCount,
      totalSuggestedUnits,
      totalEstimatedCost,
      supplierCount,
    },
  };
}
