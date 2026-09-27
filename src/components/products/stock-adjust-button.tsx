"use client";

import { useState } from "react";
import { PackagePlus } from "lucide-react";
import { StockAdjustModal, PackagingOption } from "./stock-adjust-modal";

interface Props {
  productId: string;
  productName: string;
  currentStock: number;
  unit?: string;
  packagings?: PackagingOption[];
  isStaff?: boolean;
}

export function StockAdjustButton({
  productId,
  productName,
  currentStock,
  unit = "pc",
  packagings = [],
  isStaff = false,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        <PackagePlus className="h-3.5 w-3.5" />
        Adjust Stock
      </button>
      {open && (
        <StockAdjustModal
          productId={productId}
          productName={productName}
          currentStock={currentStock}
          unit={unit}
          packagings={packagings}
          isStaff={isStaff}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
