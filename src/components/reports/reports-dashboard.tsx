"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/utils";
import { csvCell } from "@/lib/daily-ledger";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Loader2,
  AlertTriangle,
  Download,
  Printer,
  RefreshCw,
  Zap,
  Clock,
  Radio,
  ReceiptText,
} from "lucide-react";
import { DashboardStockWarningBanner } from "./dashboard-stock-warning-banner";
import { AlertsWidget } from "@/components/dashboard/alerts-widget";

type Range = "today" | "week" | "month" | "custom";
type Tab = "overview" | "lowStock";

interface Summary {
  revenue: number;
  grossProfit: number;
  transactions: number;
  tips: number;
  avgTransaction: number;
  voidedCount: number;
  refundCount: number;
  refundTotal: number;
  customerVisits: number;
}

interface RevenueDay {
  date: string;
  revenue: number;
  transactions: number;
}
interface PieSlice {
  method: string;
  value: number;
}
interface TopProduct {
  name: string;
  qty: number;
  revenue: number;
}
interface LowStockProduct {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  lowStockThreshold: number;
  category: string | null;
}
interface RecentSale {
  id: string;
  total: number;
  paymentMethod: string;
  createdAt: string;
  itemCount: number;
}

const PIE_COLORS = ["#0f2044", "#f5c518", "#10b981", "#3b82f6", "#8b5cf6"];

interface ReportsDashboardProps {
  onNavigateToReorder?: () => void;
}

export function ReportsDashboard({ onNavigateToReorder }: ReportsDashboardProps = {}) {
  const t = useTranslations("reports");
  const tp = useTranslations("products");
  const [range, setRange] = useState<Range>("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [excludeRefunds, setExcludeRefunds] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenueByDay, setRevenueByDay] = useState<RevenueDay[]>([]);
  const [pieData, setPieData] = useState<PieSlice[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [lowStock, setLowStock] = useState<LowStockProduct[]>([]);
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);

  // Real-time synchronization state for PC #2 (Back-office reports)
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState<number>(5); // 5 seconds
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [newSaleAlert, setNewSaleAlert] = useState<string | null>(null);
  const prevSalesCountRef = useRef<number | null>(null);
  const prevRevenueRef = useRef<number | null>(null);

  const fetchData = useCallback(
    async (isSilent = false) => {
      if (!isSilent) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        let url = `/api/reports?range=${range}`;
        if (range === "custom" && from && to) url += `&from=${from}&to=${to}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.summary) {
          // Detect new sales from PC #1
          if (
            prevSalesCountRef.current !== null &&
            data.summary.transactions > prevSalesCountRef.current
          ) {
            const diffRevenue = data.summary.revenue - (prevRevenueRef.current ?? 0);
            const latestMethod = data.recentSales?.[0]?.paymentMethod || "COMPLETED";
            setNewSaleAlert(
              `Sale completed on PC #1: +${formatCurrency(
                diffRevenue > 0 ? diffRevenue : (data.recentSales?.[0]?.total ?? 0)
              )} (${latestMethod})`
            );
            setTimeout(() => setNewSaleAlert(null), 6000);
          }

          prevSalesCountRef.current = data.summary.transactions;
          prevRevenueRef.current = data.summary.revenue;

          setSummary(data.summary);
          setRevenueByDay(data.revenueByDay || []);
          setPieData(data.pieData || []);
          setTopProducts(data.topProducts || []);
          setLowStock(data.lowStock || []);
          setRecentSales(data.recentSales || []);
          setLastRefreshedAt(new Date());
        }
      } catch (err) {
        console.error("Failed to fetch reports:", err);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [range, from, to]
  );

  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  // Periodic auto-polling when enabled
  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) return;
    const interval = setInterval(() => {
      fetchData(true);
    }, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchData]);

  // Auto-refresh instantly when the manager focuses or switches to this browser tab
  useEffect(() => {
    const onFocus = () => fetchData(true);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchData(true);
      }
    };
    const onStockChanged = () => fetchData(true);

    window.addEventListener("focus", onFocus);
    window.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pos:stock-changed", onStockChanged);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pos:stock-changed", onStockChanged);
    };
  }, [fetchData]);

  function handlePrint() {
    setTimeout(() => window.print(), 100);
  }

  function handleExportCSV() {
    if (!summary) return;
    const rangeLabel =
      range === "today"
        ? t("today")
        : range === "week"
          ? t("this_week")
          : range === "month"
            ? t("this_month")
            : `${from} to ${to}`;
    const rows: string[][] = [];

    rows.push(["Izah POS — Report Export"]);
    rows.push(["Period", rangeLabel]);
    rows.push(["Generated", new Date().toLocaleString()]);
    rows.push([]);

    rows.push(["SUMMARY"]);
    rows.push(["Metric", "Value"]);
    stats.forEach((s) => rows.push([s.label, s.value]));
    rows.push([]);

    rows.push(["TOP SELLING PRODUCTS"]);
    rows.push(["Product", "Units Sold", "Revenue"]);
    topProducts.forEach((p) => rows.push([p.name, String(p.qty), formatCurrency(p.revenue)]));
    rows.push([]);

    rows.push(["REVENUE BY DAY"]);
    rows.push(["Date", "Revenue", "Transactions"]);
    revenueByDay.forEach((d) =>
      rows.push([d.date, formatCurrency(d.revenue), String(d.transactions)])
    );
    rows.push([]);

    rows.push(["PAYMENT METHODS"]);
    rows.push(["Method", "Amount"]);
    pieData.forEach((d) => rows.push([d.method, formatCurrency(d.value)]));

    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `izah-report-${rangeLabel.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const stats = summary
    ? [
        {
          label: excludeRefunds ? t("net_revenue") : t("revenue"),
          value: formatCurrency(
            excludeRefunds
              ? Math.max(0, summary.revenue - (summary.refundTotal ?? 0))
              : summary.revenue
          ),
          highlight: true,
        },
        { label: t("gross_profit"), value: formatCurrency(summary.grossProfit ?? 0) },
        { label: t("transactions"), value: summary.transactions.toString() },
        { label: t("avg_transaction"), value: formatCurrency(summary.avgTransaction) },
        { label: t("tips"), value: formatCurrency(summary.tips) },
        { label: t("voided"), value: summary.voidedCount.toString() },
        {
          label: t("refunds"),
          value: `${summary.refundCount ?? 0} (${formatCurrency(summary.refundTotal ?? 0)})`,
        },
        { label: t("customer_visits"), value: summary.customerVisits.toString() },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Print-only header */}
      <div className="mb-6 hidden print:block">
        <h1 className="text-2xl font-bold">Izah POS — {t("title")}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {range === "today"
            ? t("today")
            : range === "week"
              ? t("this_week")
              : range === "month"
                ? t("this_month")
                : `${from} – ${to}`}
          {" · "}
          {t(excludeRefunds ? "net_revenue" : "revenue")}
          {" · "}
          {new Date().toLocaleDateString()}
        </p>
        <hr className="mt-3 border-gray-300" />
      </div>

      {/* PC #2 Back-Office Live Hub Bar */}
      <div className="border-primary/25 bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <div className="relative flex h-3 w-3">
            {autoRefresh && (
              <span className="bg-primary/80 absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
            )}
            <span
              className={`relative inline-flex h-3 w-3 rounded-full ${
                autoRefresh ? "bg-primary" : "bg-muted-foreground/40"
              }`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-foreground text-xs font-bold tracking-wide uppercase">
                PC #2 Back-Office Hub
              </span>
              <span className="border-primary/30 bg-primary/10 text-primary rounded-full border px-2 py-0.5 text-[10px] font-bold">
                {autoRefresh ? "Live Sync Active" : "Paused"}
              </span>
            </div>
            <p className="text-muted-foreground text-[11px]">
              {lastRefreshedAt
                ? `Last synchronized with POS at ${lastRefreshedAt.toLocaleTimeString()}`
                : "Synchronizing with PC #1..."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh interval selector */}
          <div className="flex items-center gap-1 text-xs">
            <Clock className="text-muted-foreground h-3.5 w-3.5" />
            <select
              value={autoRefresh ? refreshInterval : 0}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (val === 0) {
                  setAutoRefresh(false);
                } else {
                  setAutoRefresh(true);
                  setRefreshInterval(val);
                }
              }}
              className="border-border bg-background focus:ring-primary h-7 rounded-md border px-2 text-xs font-semibold focus:ring-1 focus:outline-none"
            >
              <option value={5}>Auto-sync: 5s (Live)</option>
              <option value={10}>Auto-sync: 10s</option>
              <option value={30}>Auto-sync: 30s</option>
              <option value={0}>Manual refresh only</option>
            </select>
          </div>

          {/* Instant Manual Refresh */}
          <button
            type="button"
            onClick={() => fetchData(true)}
            disabled={isRefreshing || loading}
            className="border-border bg-card hover:bg-muted text-foreground flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50"
            title="Refresh reports immediately"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? "text-primary animate-spin" : ""}`} />
            <span className="hidden sm:inline">Sync Now</span>
          </button>
        </div>
      </div>

      {/* New Sale Toast Alert on PC #2 */}
      {newSaleAlert && (
        <div className="border-primary/40 bg-primary text-primary-foreground flex items-center justify-between rounded-lg border px-4 py-2.5 shadow-md transition-all">
          <div className="flex items-center gap-2 text-xs font-bold">
            <Zap className="h-4 w-4 animate-bounce fill-current text-amber-300" />
            <span>{newSaleAlert}</span>
          </div>
          <button
            onClick={() => setNewSaleAlert(null)}
            className="text-primary-foreground/80 hover:text-primary-foreground text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Automated Low Stock Warning Banner on Dashboard */}
      <DashboardStockWarningBanner
        items={lowStock}
        onViewLowStockTab={() => setTab("lowStock")}
        onNavigateToReorder={onNavigateToReorder}
      />

      {/* Tab selector with Variant A underline tabs */}
      <div className="border-border/80 flex items-center justify-between border-b print:hidden">
        <div className="flex gap-2">
          {(["overview", "lowStock"] as Tab[]).map((tabId) => (
            <button
              key={tabId}
              onClick={() => setTab(tabId)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-xs font-bold tracking-wider uppercase transition-colors ${
                tab === tabId
                  ? "border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground border-transparent"
              }`}
            >
              {tabId === "overview" ? (
                <span>{t("overview")}</span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span>{t("low_stock")}</span>
                  {lowStock.length > 0 && (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                      {lowStock.length}
                    </span>
                  )}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleExportCSV}
            className="border-border/80 bg-card text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold shadow-2xs transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{t("export_csv")}</span>
          </button>
          <button
            onClick={handlePrint}
            className="border-border/80 bg-card text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold shadow-2xs transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>{t("print")}</span>
          </button>
        </div>
      </div>

      {/* Range controls & filters */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {(["today", "week", "month", "custom"] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-all ${
              range === r
                ? "bg-primary text-primary-foreground border-primary shadow-2xs"
                : "border-border/80 text-muted-foreground hover:bg-muted/40 hover:text-foreground bg-card"
            }`}
          >
            {r === "today"
              ? t("today")
              : r === "week"
                ? t("this_week")
                : r === "month"
                  ? t("this_month")
                  : t("custom")}
          </button>
        ))}

        {range === "custom" && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border-border bg-card focus:ring-primary h-8 rounded-md border px-2 font-mono text-xs shadow-2xs focus:ring-1 focus:outline-none"
            />
            <span className="text-muted-foreground text-xs">to</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border-border bg-card focus:ring-primary h-8 rounded-md border px-2 font-mono text-xs shadow-2xs focus:ring-1 focus:outline-none"
            />
            <button
              onClick={() => {
                fetchData();
              }}
              disabled={!from || !to}
              className="bg-primary text-primary-foreground h-8 rounded-md px-3 text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        )}

        {loading && <Loader2 className="text-muted-foreground ml-2 h-4 w-4 animate-spin" />}

        <label className="text-muted-foreground ml-auto flex cursor-pointer items-center gap-1.5 text-xs select-none">
          <input
            type="checkbox"
            checked={excludeRefunds}
            onChange={(e) => setExcludeRefunds(e.target.checked)}
            className="accent-primary"
          />
          <span>{t("exclude_refunds")}</span>
        </label>
      </div>

      {/* ===== LOW STOCK TAB ===== */}
      {tab === "lowStock" && (
        <div className="border-border/80 bg-card overflow-hidden rounded-lg border shadow-xs">
          <div className="border-border/80 bg-muted/20 flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h2 className="text-foreground text-xs font-bold tracking-wider uppercase">
                {t("low_stock_products")}
              </h2>
            </div>
            <span className="text-muted-foreground font-mono text-xs">{lowStock.length} items</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-border/80 bg-muted/40 border-b">
                <tr className="text-muted-foreground/90 text-[11px] font-bold tracking-wider uppercase">
                  <th className="px-4 py-3">{t("product")}</th>
                  <th className="px-4 py-3">{tp("sku")}</th>
                  <th className="px-4 py-3">{tp("category")}</th>
                  <th className="px-4 py-3 text-right">{tp("stock")}</th>
                  <th className="px-4 py-3 text-right">{t("threshold")}</th>
                </tr>
              </thead>
              <tbody className="divide-border/60 divide-y">
                {lowStock.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-muted-foreground px-4 py-8 text-center text-sm">
                      {t("all_stocked")}
                    </td>
                  </tr>
                ) : (
                  lowStock.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="text-foreground px-4 py-3.5 font-medium">{p.name}</td>
                      <td className="text-muted-foreground px-4 py-3.5 font-mono text-xs">
                        {p.sku ?? "—"}
                      </td>
                      <td className="text-muted-foreground px-4 py-3.5 text-xs">
                        {p.category ?? "—"}
                      </td>
                      <td
                        className={`px-4 py-3.5 text-right font-mono font-bold ${p.stock === 0 ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}
                      >
                        {p.stock}
                      </td>
                      <td className="text-muted-foreground px-4 py-3.5 text-right font-mono text-xs">
                        {p.lowStockThreshold}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== OVERVIEW TAB ===== */}
      {tab === "overview" && (
        <>
          {/* Summary Metric Cards with Variant A Hairline Borders */}
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="border-border/80 bg-card hover:border-primary/40 space-y-1.5 rounded-lg border p-4 shadow-xs transition-colors"
              >
                <p className="text-muted-foreground/80 text-[11px] font-bold tracking-wider uppercase">
                  {s.label}
                </p>
                <p
                  className={`font-mono text-2xl font-extrabold tracking-tight ${s.highlight ? "text-primary" : "text-foreground"}`}
                >
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          {/* Quick Reorder Action Card (if low-stock products exist) */}
          {lowStock.length > 0 && onNavigateToReorder && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    {lowStock.length} Product(s) Below Low-Stock Threshold
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Generate automated supplier purchase orders and export official PDF order sheets.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onNavigateToReorder}
                data-testid="dashboard-goto-reorder-btn"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 text-xs font-bold shadow-xs transition-colors cursor-pointer shrink-0"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Open Reorder List &amp; PDF Order Sheet</span>
              </button>
            </div>
          )}

          {/* Charts with Crisp Borders */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Revenue Trend */}
            <div className="border-border/80 bg-card rounded-lg border p-4 shadow-xs lg:col-span-2">
              <div className="border-border/60 mb-4 flex items-center justify-between border-b pb-2">
                <h2 className="text-foreground text-xs font-bold tracking-wider uppercase">
                  {t("revenue_trend")}
                </h2>
              </div>
              {revenueByDay.length === 0 ? (
                <div className="text-muted-foreground flex h-48 items-center justify-center text-sm">
                  {t("no_data")}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={230} minWidth={300}>
                  <BarChart data={revenueByDay} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => {
                        const d = new Date(v + "T00:00:00");
                        return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
                      }}
                    />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₱${v}`} width={48} />
                    <Tooltip
                      formatter={(v: any) => [
                        v !== undefined ? formatCurrency(Number(v) || 0) : "₱0.00",
                        "Revenue",
                      ]}
                      labelFormatter={(l) => new Date(l + "T00:00:00").toLocaleDateString()}
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                      }}
                    />
                    <Bar
                      dataKey="revenue"
                      fill="currentColor"
                      className="text-primary"
                      radius={[3, 3, 0, 0]}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Payment Breakdown Pie */}
            <div className="border-border/80 bg-card rounded-lg border p-4 shadow-xs">
              <div className="border-border/60 mb-4 flex items-center justify-between border-b pb-2">
                <h2 className="text-foreground text-xs font-bold tracking-wider uppercase">
                  {t("payment_methods")}
                </h2>
              </div>
              {pieData.length === 0 ? (
                <div className="text-muted-foreground flex h-48 items-center justify-center text-sm">
                  {t("no_data")}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={230} minWidth={200}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="method"
                      cx="50%"
                      cy="45%"
                      outerRadius={75}
                      label={({ method, percent }) =>
                        `${method} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                      isAnimationActive={false}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => formatCurrency(Number(v) || 0)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Low-Stock Threshold Alerts Widget */}
          <AlertsWidget variant="dashboard" title="Inventory Stock Alerts" />

          {/* Bottom Grid: Top Selling Products & PC #1 Live Sales Stream */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Top Selling Products */}
            <div className="border-border/80 bg-card overflow-hidden rounded-lg border shadow-xs">
              <div className="border-border/80 bg-muted/20 border-b px-4 py-3">
                <h2 className="text-foreground text-xs font-bold tracking-wider uppercase">
                  {t("top_selling_products")}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-border/80 bg-muted/40 border-b">
                    <tr className="text-muted-foreground/90 text-[11px] font-bold tracking-wider uppercase">
                      <th className="px-4 py-3">{t("product")}</th>
                      <th className="px-4 py-3 text-right">{t("units_sold")}</th>
                      <th className="px-4 py-3 text-right">{t("revenue")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-border/60 divide-y">
                    {topProducts.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="text-muted-foreground px-4 py-8 text-center text-sm"
                        >
                          {t("no_sales_data")}
                        </td>
                      </tr>
                    ) : (
                      topProducts.map((p, i) => (
                        <tr key={`${p.name}-${i}`} className="hover:bg-muted/30 transition-colors">
                          <td className="text-foreground px-4 py-3.5 font-medium">{p.name}</td>
                          <td className="px-4 py-3.5 text-right font-mono font-semibold">{p.qty}</td>
                          <td className="text-primary px-4 py-3.5 text-right font-mono font-bold">
                            {formatCurrency(p.revenue)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* PC #1 Live Sales Stream */}
            <div className="border-border/80 bg-card overflow-hidden rounded-lg border shadow-xs">
              <div className="border-border/80 bg-muted/20 flex items-center justify-between border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <ReceiptText className="text-primary h-3.5 w-3.5" />
                  <h2 className="text-foreground text-xs font-bold tracking-wider uppercase">
                    PC #1 Live Sales Stream
                  </h2>
                </div>
                <span className="text-muted-foreground font-mono text-[11px]">
                  {recentSales.length} recent
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-border/80 bg-muted/40 border-b">
                    <tr className="text-muted-foreground/90 text-[11px] font-bold tracking-wider uppercase">
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Method</th>
                      <th className="px-4 py-3 text-center">Items</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-border/60 divide-y">
                    {recentSales.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="text-muted-foreground px-4 py-8 text-center text-xs"
                        >
                          Waiting for transactions from PC #1 POS Terminal...
                        </td>
                      </tr>
                    ) : (
                      recentSales.map((sale) => (
                        <tr key={sale.id} className="hover:bg-muted/30 transition-colors">
                          <td className="text-muted-foreground px-4 py-3 font-mono text-xs">
                            {new Date(sale.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </td>
                          <td className="px-4 py-3">
                            <span className="border-border/80 bg-muted text-foreground inline-block rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold">
                              {sale.paymentMethod}
                            </span>
                          </td>
                          <td className="text-muted-foreground px-4 py-3 text-center font-mono text-xs">
                            {sale.itemCount}
                          </td>
                          <td className="text-primary px-4 py-3 text-right font-mono text-xs font-bold">
                            {formatCurrency(sale.total)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
