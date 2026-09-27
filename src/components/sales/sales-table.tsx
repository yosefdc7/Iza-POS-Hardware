"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RotateCcw, ChevronDown, ChevronRight, Receipt } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { RefundModal } from "./refund-modal";

interface SaleItem {
  id: string;
  name: string;
  quantity: number | { toString(): string };
  price: { toString(): string };
  total: { toString(): string };
  notes?: string | null;
  productId?: string | null;
}

interface Sale {
  id: string;
  createdAt: Date | string;
  total: { toString(): string };
  paymentMethod: string;
  status: string;
  items: SaleItem[];
  user: { name: string } | null;
}

interface SalesTableProps {
  sales: Sale[];
  isStaff?: boolean;
}

export function SalesTable({ sales, isStaff = false }: SalesTableProps) {
  const t = useTranslations("sales");
  const tr = useTranslations("receipt");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<Sale | null>(null);

  const saleDateFormatter = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  if (sales.length === 0) {
    return (
      <div className="border-border/80 text-muted-foreground bg-card/40 flex h-48 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm">
        <Receipt className="text-muted-foreground/40 mb-2 h-8 w-8" />
        <p className="text-foreground/70 font-semibold">{t("no_sales")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="border-border/80 bg-card overflow-hidden rounded-lg border shadow-xs">
        <div className="overflow-x-auto text-sm">
          <table className="w-full text-left">
            <thead className="border-border/80 bg-muted/40 border-b">
              <tr>
                <th className="text-muted-foreground/90 px-4 py-3 text-[11px] font-bold tracking-wider uppercase">
                  {t("date")}
                </th>
                <th className="text-muted-foreground/90 px-4 py-3 text-[11px] font-bold tracking-wider uppercase">
                  {t("cashier")}
                </th>
                <th className="text-muted-foreground/90 px-4 py-3 text-[11px] font-bold tracking-wider uppercase">
                  {t("payment")}
                </th>
                <th className="text-muted-foreground/90 px-4 py-3 text-[11px] font-bold tracking-wider uppercase">
                  {t("status")}
                </th>
                <th className="text-muted-foreground/90 px-4 py-3 text-right text-[11px] font-bold tracking-wider uppercase">
                  {isStaff ? "Items / Qty" : t("total")}
                </th>
                <th className="text-muted-foreground/90 px-4 py-3 text-center text-[11px] font-bold tracking-wider uppercase">
                  {t("actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-border/60 divide-y">
              {sales.flatMap((sale, idx) => {
                const saleTimestamp = new Date(sale.createdAt).getTime();
                const saleKey = `${sale.id ?? "no-id"}-${saleTimestamp}-${idx}`;
                const isExpanded = expanded === sale.id;

                const mainRow = (
                  <tr
                    key={`${saleKey}-main`}
                    className={cn(
                      "hover:bg-muted/30 cursor-pointer transition-colors",
                      isExpanded && "bg-muted/20"
                    )}
                    onClick={() => setExpanded(isExpanded ? null : sale.id)}
                  >
                    <td className="text-foreground px-4 py-3.5 font-mono text-xs font-medium">
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="text-muted-foreground h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
                        )}
                        <span>{saleDateFormatter.format(new Date(sale.createdAt))}</span>
                      </div>
                    </td>
                    <td className="text-muted-foreground px-4 py-3.5 text-xs font-medium">
                      {sale.user?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3.5 text-xs font-medium">
                      <span className="bg-muted/60 text-foreground inline-block rounded px-2 py-0.5 font-mono text-[11px]">
                        {sale.paymentMethod}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                          sale.status === "COMPLETED" &&
                            "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                          sale.status === "VOIDED" &&
                            "bg-destructive/10 text-destructive border-destructive/20",
                          (sale.status === "REFUNDED" || sale.status === "PARTIALLY_REFUNDED") &&
                            "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        )}
                      >
                        {sale.status}
                      </span>
                    </td>
                    <td className="text-foreground px-4 py-3.5 text-right font-mono">
                      {isStaff ? (
                        <span className="text-xs font-semibold">
                          {sale.items.length} {sale.items.length === 1 ? "item" : "items"} (
                          {sale.items.reduce((s, it) => s + Number(it.quantity), 0)} qty)
                        </span>
                      ) : (
                        <span className="font-bold">{formatCurrency(parseFloat(sale.total.toString()))}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center">
                        {!isStaff && (sale.status === "COMPLETED" || sale.status === "PARTIALLY_REFUNDED") && (
                          <button
                            onClick={() => setRefunding(sale)}
                            className="border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium shadow-2xs transition-colors"
                            title="Issue Refund"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>{t("refund")}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );

                if (!isExpanded) {
                  return [mainRow];
                }

                const detailRow = (
                  <tr className="bg-muted/15" key={`${saleKey}-details`}>
                    <td colSpan={6} className="border-border/40 border-t px-6 py-4">
                      <div className="border-border/60 bg-card rounded-md border p-3 shadow-2xs">
                        <p className="text-muted-foreground mb-2 text-[11px] font-bold tracking-wider uppercase">
                          {tr("receipt")} ({sale.items.length})
                        </p>
                        <table className="w-full text-xs">
                          <thead className="border-border/40 text-muted-foreground border-b font-semibold">
                            <tr>
                              <th className="py-1.5 text-left">{tr("items")}</th>
                              <th className="py-1.5 text-right">{tr("qty")}</th>
                              {!isStaff && (
                                <>
                                  <th className="py-1.5 text-right">{tr("price")}</th>
                                  <th className="py-1.5 text-right">{t("total")}</th>
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-border/30 divide-y">
                            {sale.items.map((item, i) => {
                              const itemKey = `${item.id ?? "no-item-id"}-${saleKey}-${i}`;
                              return (
                                <tr key={itemKey}>
                                  <td className="text-foreground py-2 font-medium">
                                    {item.name}
                                    {item.notes && (
                                      <p className="text-muted-foreground mt-0.5 text-[10px] italic">
                                        {item.notes}
                                      </p>
                                    )}
                                  </td>
                                  <td className="py-2 text-right font-mono">{String(item.quantity)}</td>
                                  {!isStaff && (
                                    <>
                                      <td className="text-muted-foreground py-2 text-right font-mono">
                                        {formatCurrency(parseFloat(item.price.toString()))}
                                      </td>
                                      <td className="text-foreground py-2 text-right font-mono font-bold">
                                        {formatCurrency(parseFloat(item.total.toString()))}
                                      </td>
                                    </>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                );

                return [mainRow, detailRow];
              })}
            </tbody>
          </table>
        </div>
      </div>

      {refunding && (
        <RefundModal
          saleId={refunding.id}
          saleTotal={parseFloat(refunding.total.toString())}
          items={refunding.items}
          onClose={() => setRefunding(null)}
        />
      )}
    </>
  );
}
