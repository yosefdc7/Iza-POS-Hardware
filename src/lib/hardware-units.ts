export interface UnitOption {
  value: string;
  label: string;
  category: "Count" | "Length" | "Weight" | "Volume" | "Bulk" | "Custom";
}

export const DEFAULT_HARDWARE_UNITS: UnitOption[] = [
  // Count / Discrete
  { value: "pc", label: "Piece (pc)", category: "Count" },
  { value: "pair", label: "Pair (pair)", category: "Count" },
  { value: "set", label: "Set (set)", category: "Count" },
  { value: "pack", label: "Pack (pack)", category: "Count" },
  { value: "box", label: "Box (box)", category: "Count" },
  { value: "roll", label: "Roll (roll)", category: "Count" },
  { value: "bundle", label: "Bundle (bundle)", category: "Count" },

  // Length
  { value: "m", label: "Meter (m)", category: "Length" },
  { value: "ft", label: "Foot (ft)", category: "Length" },
  { value: "in", label: "Inch (in)", category: "Length" },
  { value: "cm", label: "Centimeter (cm)", category: "Length" },
  { value: "yd", label: "Yard (yd)", category: "Length" },

  // Weight
  { value: "kg", label: "Kilogram (kg)", category: "Weight" },
  { value: "g", label: "Gram (g)", category: "Weight" },
  { value: "lb", label: "Pound (lb)", category: "Weight" },

  // Volume
  { value: "L", label: "Liter (L)", category: "Volume" },
  { value: "mL", label: "Milliliter (mL)", category: "Volume" },
  { value: "gal", label: "Gallon (gal)", category: "Volume" },
  { value: "tin", label: "Tin / Can (tin)", category: "Volume" },
  { value: "drum", label: "Drum (drum)", category: "Volume" },

  // Bulk & Structural
  { value: "bag", label: "Bag (bag - cement, sand)", category: "Bulk" },
  { value: "sheet", label: "Sheet (sheet - plywood, GI)", category: "Bulk" },
  { value: "bar", label: "Bar / Length (bar - rebar, pipe)", category: "Bulk" },
  { value: "pail", label: "Pail (pail - paint, paste)", category: "Bulk" },
  { value: "sack", label: "Sack (sack - gravel)", category: "Bulk" },
  { value: "cu.m", label: "Cubic Meter (cu.m)", category: "Bulk" },
];

export interface PackagingMathBreakdown {
  fullBoxes: number;
  looseUnits: number;
  primaryPackName: string;
  conversionQty: number;
  formattedText: string;
}

export function computeStockBreakdown(
  totalStock: number,
  baseUnit: string,
  packagings?: Array<{ name: string; conversionQty: number | { toString(): string } }>
): PackagingMathBreakdown | null {
  if (!packagings || packagings.length === 0) return null;

  // Find primary packaging (e.g. Box or highest conversionQty)
  const sorted = [...packagings].sort((a, b) => {
    const qtyA = Number(a.conversionQty);
    const qtyB = Number(b.conversionQty);
    return qtyB - qtyA;
  });

  const primary = sorted[0];
  const conversionQty = Number(primary.conversionQty);
  if (!conversionQty || conversionQty <= 1) return null;

  const fullBoxes = Math.floor(totalStock / conversionQty);
  const looseUnits = Math.round((totalStock % conversionQty) * 10000) / 10000;

  let formattedText = "";
  if (fullBoxes > 0 && looseUnits > 0) {
    formattedText = `${fullBoxes} ${primary.name.toLowerCase()}${fullBoxes > 1 ? "es" : ""} + ${looseUnits} ${baseUnit}`;
  } else if (fullBoxes > 0) {
    formattedText = `${fullBoxes} ${primary.name.toLowerCase()}${fullBoxes > 1 ? "es" : ""}`;
  } else {
    formattedText = `${looseUnits} ${baseUnit}`;
  }

  return {
    fullBoxes,
    looseUnits,
    primaryPackName: primary.name,
    conversionQty,
    formattedText,
  };
}

export function computePackagingPricing(
  conversionQty: number,
  basePrice?: number,
  packagingPrice?: number,
  packagingCost?: number
) {
  const qty = Number(conversionQty) || 1;
  const derivedUnitCost = packagingCost && qty > 0 ? Math.round((packagingCost / qty) * 100) / 100 : undefined;
  
  let unitEquivalentPrice: number | undefined;
  let bulkDiscountPercent: number | undefined;
  let totalSavings: number | undefined;

  if (packagingPrice && qty > 0) {
    unitEquivalentPrice = Math.round((packagingPrice / qty) * 100) / 100;
  }

  if (basePrice && packagingPrice && qty > 0) {
    const fullPrice = basePrice * qty;
    if (fullPrice > packagingPrice) {
      totalSavings = Math.round((fullPrice - packagingPrice) * 100) / 100;
      bulkDiscountPercent = Math.round(((fullPrice - packagingPrice) / fullPrice) * 1000) / 10;
    }
  }

  return {
    derivedUnitCost,
    unitEquivalentPrice,
    bulkDiscountPercent,
    totalSavings,
  };
}
