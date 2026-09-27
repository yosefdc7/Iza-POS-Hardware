"use client";

import { useState } from "react";
import { DailySalesLedger } from "./daily-sales-ledger";
import { ReportsDashboard } from "./reports-dashboard";
import { ReorderListTab } from "@/components/dashboard/reorder-list-tab";
import { BarChart3, ShoppingCart, BookOpen } from "lucide-react";

export function ReportsWorkspace({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState<"overview" | "reorder" | "ledger">(isAdmin ? "overview" : "ledger");

  return (
    <div className="space-y-5">
      {isAdmin && (
        <div className="flex gap-2 border-b print:hidden">
          <button
            onClick={() => setTab("overview")}
            data-testid="tab-overview"
            className={`px-3.5 py-2 text-sm font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              tab === "overview"
                ? "border-primary text-primary border-b-2"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            <span>Overview &amp; Stock</span>
          </button>
          <button
            onClick={() => setTab("reorder")}
            data-testid="tab-reorder"
            className={`px-3.5 py-2 text-sm font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              tab === "reorder"
                ? "border-primary text-primary border-b-2"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShoppingCart className="h-4 w-4" />
            <span>Reorder List</span>
          </button>
          <button
            onClick={() => setTab("ledger")}
            data-testid="tab-ledger"
            className={`px-3.5 py-2 text-sm font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              tab === "ledger"
                ? "border-primary text-primary border-b-2"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BookOpen className="h-4 w-4" />
            <span>Daily Sales Ledger</span>
          </button>
        </div>
      )}

      {tab === "overview" && isAdmin ? (
        <ReportsDashboard onNavigateToReorder={() => setTab("reorder")} />
      ) : tab === "reorder" && isAdmin ? (
        <ReorderListTab />
      ) : (
        <DailySalesLedger isAdmin={isAdmin} />
      )}
    </div>
  );
}
