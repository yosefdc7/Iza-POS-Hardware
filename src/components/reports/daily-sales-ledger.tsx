"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Printer, Search } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type LedgerSale = {
  id: string;
  receipt: { label: string; warning: string | null };
  seriesName?: string | null;
  drSiNumber?: string | null;
  createdAt: string;
  businessDate: string;
  customer: string;
  cashier: string;
  status: string;
  total: number;
  refundTotal: number;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    basePrice?: number | null;
    unitCost?: number | null;
    sellingValue: number;
    grossProfit?: number | null;
  }>;
};

type LedgerData = {
  sales: LedgerSale[];
  totals: {
    sales: number;
    grossRevenue: number;
    refunds: number;
    grossProfit: number;
    seriesTotals?: Record<string, number>;
    totalBaseValue?: number;
    totalSellingValue?: number;
  };
  series: Array<{ id: string; name: string }>;
  cashiers: Array<{ id: string; name: string }>;
  totalCount: number;
  pageSize: number;
  timeZone?: string;
  from?: string;
  to?: string;
};

function todayInTimeZone(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

export function DailySalesLedger({ isAdmin }: { isAdmin: boolean }) {
  const today = todayInTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [seriesId, setSeriesId] = useState("");
  const [cashierId, setCashierId] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LedgerData>({
    sales: [],
    totals: { sales: 0, grossRevenue: 0, refunds: 0, grossProfit: 0 },
    series: [],
    cashiers: [],
    totalCount: 0,
    pageSize: 50,
  });
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const datesInitialized = useRef(false);

  const params = useMemo(() => {
    const value = new URLSearchParams({ from, to, page: String(page), pageSize: "50" });
    if (seriesId) value.set("seriesId", seriesId);
    if (cashierId) value.set("cashierId", cashierId);
    if (status) value.set("status", status);
    if (query) value.set("q", query);
    return value;
  }, [from, to, seriesId, cashierId, status, query, page]);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/reports/daily-ledger?${params}`)
      .then(async (response) => {
        const next = (await response.json()) as LedgerData;
        if (!response.ok) throw new Error("Could not load the daily ledger");
        if (!datesInitialized.current && next.timeZone) {
          const businessToday = todayInTimeZone(next.timeZone);
          setFrom((current) => (current === today ? businessToday : current));
          setTo((current) => (current === today ? businessToday : current));
          datesInitialized.current = true;
        }
        setData(next);
      })
      .catch(() => setData((current) => ({ ...current, sales: [] })))
      .finally(() => setLoading(false));
  }, [params, today]);
  useEffect(load, [load]);

  const resetPage = () => setPage(1);
  const exportUrl = `/api/reports/daily-ledger?${params}&format=csv`;
  const totalPages = Math.max(1, Math.ceil((data.totalCount ?? 0) / (data.pageSize ?? 50)));

  async function printLedger() {
    setPrinting(true);
    try {
      const response = await fetch(`/api/reports/daily-ledger?${params}&format=print`);
      if (!response.ok) throw new Error("Could not load the printable ledger");
      const printable = (await response.json()) as LedgerData;
      setData(printable);
      setTimeout(() => window.print(), 0);
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="space-y-4" id="daily-ledger-print">
      <div className="flex flex-wrap items-end gap-2 print:hidden">
        {isAdmin && (
          <>
            <label className="text-xs">
              From
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  resetPage();
                }}
                className="bg-background mt-1 block h-9 rounded-md border px-2"
              />
            </label>
            <label className="text-xs">
              To
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  resetPage();
                }}
                className="bg-background mt-1 block h-9 rounded-md border px-2"
              />
            </label>
            <select
              aria-label="Receipt series"
              value={seriesId}
              onChange={(e) => {
                setSeriesId(e.target.value);
                resetPage();
              }}
              className="bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="">All series</option>
              {data.series.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Cashier"
              value={cashierId}
              onChange={(e) => {
                setCashierId(e.target.value);
                resetPage();
              }}
              className="bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="">All cashiers</option>
              {data.cashiers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                resetPage();
              }}
              className="bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="">All statuses</option>
              <option>COMPLETED</option>
              <option>VOIDED</option>
              <option>REFUNDED</option>
              <option>PARTIALLY_REFUNDED</option>
            </select>
          </>
        )}
        <div className="relative min-w-56 flex-1">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              resetPage();
            }}
            placeholder="Customer, receipt, or item"
            className="bg-background h-9 w-full rounded-md border pr-3 pl-8 text-sm"
          />
        </div>
        <a
          href={exportUrl}
          className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm"
        >
          <Download className="h-4 w-4" /> CSV
        </a>
        <button
          onClick={printLedger}
          disabled={printing}
          className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm"
        >
          <Printer className="h-4 w-4" /> Print
        </button>
      </div>

      {isAdmin ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          <Metric label="Receipts on page" value={String(data.totals?.sales ?? 0)} />
          <Metric label="Gross revenue" value={formatCurrency(data.totals?.grossRevenue ?? 0)} />
          {data.totals?.seriesTotals?.["211"] != null && (
            <Metric label="211 Receipts" value={formatCurrency(data.totals.seriesTotals["211"])} />
          )}
          {data.totals?.seriesTotals?.["CHB"] != null && (
            <Metric label="CHB Receipts" value={formatCurrency(data.totals.seriesTotals["CHB"])} />
          )}
          {data.totals?.totalBaseValue != null && (
            <Metric label="Total Base Value" value={formatCurrency(data.totals.totalBaseValue)} />
          )}
          {data.totals?.totalSellingValue != null && (
            <Metric label="Total Selling Value" value={formatCurrency(data.totals.totalSellingValue)} />
          )}
          <Metric label="Refunds" value={formatCurrency(data.totals?.refunds ?? 0)} />
          <Metric label="Gross profit" value={formatCurrency(data.totals?.grossProfit ?? 0)} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric label="Receipts in view" value={String(data.totals?.sales ?? 0)} />
          <Metric
            label="Total Items Sold"
            value={String(
              data.sales.reduce((sum, s) => sum + s.items.reduce((iSum, it) => iSum + it.quantity, 0), 0)
            )}
          />
          <Metric label="Total Receipts (Scope)" value={String(data.totalCount ?? 0)} />
        </div>
      )}

      <div className="hidden text-sm print:block">
        <h2 className="text-xl font-bold">Daily Sales Ledger</h2>
        <p>
          {data.from} to {data.to} · {data.timeZone}
        </p>
      </div>
      {data.sales.some((sale) => sale.receipt.warning) && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          Backfilled estimate: legacy receipt references, units, and costs are approximations.
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground py-12 text-center text-sm">Loading ledger…</p>
      ) : data.sales.length === 0 ? (
        <p className="text-muted-foreground rounded-md border py-12 text-center text-sm">
          No sales match these filters.
        </p>
      ) : (
        <div className="space-y-3">
          {data.sales.map((sale, index) => (
            <div key={sale.id} className="space-y-2">
              {(index === 0 || data.sales[index - 1].businessDate !== sale.businessDate) && (
                <h3 className="border-b pb-1 text-sm font-bold">{sale.businessDate}</h3>
              )}
              <ReceiptGroup sale={sale} isAdmin={isAdmin} timeZone={data.timeZone} />
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between print:hidden">
        <span className="text-muted-foreground text-xs">{data.totalCount} receipts</span>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border px-3 py-1 text-sm disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border px-3 py-1 text-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card rounded-md border p-3">
      <p className="text-muted-foreground text-[11px] font-semibold uppercase">{label}</p>
      <p className="mt-1 font-mono text-xl font-bold">{value}</p>
    </div>
  );
}

function ReceiptGroup({
  sale,
  isAdmin,
  timeZone,
}: {
  sale: LedgerSale;
  isAdmin: boolean;
  timeZone?: string;
}) {
  return (
    <article className="bg-card break-inside-avoid overflow-hidden rounded-md border">
      <header className="bg-muted/30 flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold">{sale.receipt.label}</span>
          {sale.drSiNumber && (
            <span className="rounded bg-sky-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-200">
              DR/SI: {sale.drSiNumber}
            </span>
          )}
          {sale.receipt.warning && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900">
              {sale.receipt.warning}
            </span>
          )}
          <span className="text-muted-foreground ml-2">{sale.customer}</span>
        </div>
        <div className="text-muted-foreground text-xs">
          {new Intl.DateTimeFormat(undefined, {
            dateStyle: "short",
            timeStyle: "short",
            ...(timeZone ? { timeZone } : {}),
          }).format(new Date(sale.createdAt))}{" "}
          · {sale.cashier} · {sale.status}
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="p-2">Item</th>
              <th className="p-2 text-right">Quantity</th>
              {isAdmin && (
                <>
                  <th className="p-2 text-right">Base price</th>
                  <th className="p-2 text-right">Selling price</th>
                  <th className="p-2 text-right">Unit cost</th>
                  <th className="p-2 text-right">Profit</th>
                  <th className="p-2 text-right">Selling value</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="p-2">{item.name}</td>
                <td className="p-2 text-right font-mono">
                  {item.quantity} {item.unit}
                </td>
                {isAdmin && (
                  <>
                    <td className="p-2 text-right font-mono text-muted-foreground">
                      {formatCurrency(item.basePrice ?? item.unitPrice)}
                    </td>
                    <td className="p-2 text-right font-mono font-medium">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {item.unitCost == null ? "Unknown" : formatCurrency(item.unitCost)}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {item.grossProfit == null ? "Unknown" : formatCurrency(item.grossProfit)}
                    </td>
                    <td className="p-2 text-right font-mono font-semibold">
                      {formatCurrency(item.sellingValue)}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="flex justify-end gap-5 border-t px-3 py-2 text-xs">
        {isAdmin ? (
          <>
            <span>
              Refunds: <b>{formatCurrency(sale.refundTotal)}</b>
            </span>
            <span>
              Sale total: <b>{formatCurrency(sale.total)}</b>
            </span>
          </>
        ) : (
          <span>
            Total Items:{" "}
            <b>
              {sale.items.length} ({sale.items.reduce((s, it) => s + it.quantity, 0)} units)
            </b>
          </span>
        )}
      </footer>
    </article>
  );
}
