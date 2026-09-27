"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Database,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ArrowLeft,
  ShieldCheck,
  Server,
  Layers,
  Copy,
  Check,
  Radio,
  ExternalLink,
  TableProperties,
  Clock,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import type { DatabaseDiagnosticResult, TableHealthItem } from "@/lib/db";

interface DatabaseDiagnosticsViewProps {
  initialData: DatabaseDiagnosticResult;
}

export function DatabaseDiagnosticsView({ initialData }: DatabaseDiagnosticsViewProps) {
  const [diagnostic, setDiagnostic] = useState<DatabaseDiagnosticResult>(initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState(false);

  // Sandbox connection tester state
  const [sandboxUrl, setSandboxUrl] = useState("");
  const [isTestingSandbox, setIsTestingSandbox] = useState(false);
  const [sandboxResult, setSandboxResult] = useState<DatabaseDiagnosticResult | null>(null);

  // Table filter
  const [tableFilter, setTableFilter] = useState<"all" | "essential" | "missing">("all");

  async function runActiveDiagnostic() {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/diagnostics/database");
      const data = await response.json();
      if (!response.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Failed to run diagnostics");
        return;
      }
      setDiagnostic(data);
      toast.success("Database diagnostics refreshed");
    } catch (err) {
      console.error("Diagnostic error:", err);
      toast.error("Network error while running database diagnostics");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleTestSandbox(e: React.FormEvent) {
    e.preventDefault();
    if (!sandboxUrl.trim()) {
      toast.error("Please enter a PostgreSQL connection string to test");
      return;
    }

    setIsTestingSandbox(true);
    setSandboxResult(null);
    try {
      const response = await fetch("/api/diagnostics/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionString: sandboxUrl.trim() }),
      });
      const data = await response.json();
      setSandboxResult(data);
      if (data.ok) {
        toast.success(`Connection succeeded! Latency: ${data.latencyMs}ms`);
      } else {
        toast.error(`Connection failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      console.error("Sandbox test error:", err);
      toast.error("Network error executing sandbox connection test");
    } finally {
      setIsTestingSandbox(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedTarget(true);
    toast.info("Sanitized connection string copied to clipboard");
    setTimeout(() => setCopiedTarget(false), 2000);
  }

  const isConnected = diagnostic.ok;
  const verifiedTables = diagnostic.coreTables ? diagnostic.coreTables.filter((t) => t.exists) : [];
  const missingTables = diagnostic.coreTables ? diagnostic.coreTables.filter((t) => !t.exists) : [];

  const filteredTables: TableHealthItem[] = (diagnostic.coreTables || []).filter((table) => {
    if (tableFilter === "essential") return table.essential;
    if (tableFilter === "missing") return !table.exists;
    return true;
  });

  return (
    <div className="space-y-8 max-w-5xl pb-12">
      {/* Breadcrumb & Navigation */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href="/settings" className="hover:text-foreground transition-colors flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" />
              Settings
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">Database &amp; System Diagnostics</span>
          </nav>
          <h1 className="text-2xl font-bold tracking-tight">Database &amp; System Diagnostics</h1>
          <p className="text-sm text-muted-foreground">
            Real-time connection verification, query latency measurement, schema table checks, and environment parameter health.
          </p>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-2">
          <button
            onClick={runActiveDiagnostic}
            disabled={isRefreshing}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>{isRefreshing ? "Probing..." : "Run Full Diagnostic"}</span>
          </button>
        </div>
      </div>

      {/* Metric Ribbon */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Connection Status */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Connection Status</span>
            <Radio className={`h-4 w-4 ${isConnected ? "text-emerald-500 animate-pulse" : "text-rose-500"}`} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            {isConnected ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Active / Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                <XCircle className="h-3.5 w-3.5" />
                Unreachable / Disconnected
              </span>
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {diagnostic.source === "PGLITE_EMBEDDED"
              ? "Local PGlite Engine (In-Process)"
              : diagnostic.source === "SQL_ENVIRONMENT"
                ? "Google Cloud SQL / Environment Variables"
                : "PostgreSQL via DATABASE_URL"}
          </p>
        </div>

        {/* Metric 2: Round-Trip Latency */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Round-Trip Latency</span>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-bold tracking-tight text-foreground">
              {diagnostic.latencyMs !== undefined ? diagnostic.latencyMs : "—"}
            </span>
            <span className="text-xs text-muted-foreground">ms</span>
            {diagnostic.latencyMs !== undefined && (
              <span
                className={`ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  diagnostic.latencyMs < 50
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : diagnostic.latencyMs < 200
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                }`}
              >
                {diagnostic.latencyMs < 50 ? "Fast" : diagnostic.latencyMs < 200 ? "Normal" : "Slow"}
              </span>
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Socket ping &amp; handshake latency</p>
        </div>

        {/* Metric 3: Active Engine */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Active Engine</span>
            <Server className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2">
            <span className="text-base font-bold text-foreground">
              {diagnostic.engine === "postgresql"
                ? "PostgreSQL"
                : diagnostic.engine === "pglite"
                  ? "Local PGlite"
                  : "Fallback Proxy"}
            </span>
          </div>
          <p className="mt-2 truncate text-[11px] text-muted-foreground font-mono" title={diagnostic.serverVersion}>
            {diagnostic.serverVersion || "WASM / Native Driver"}
          </p>
        </div>

        {/* Metric 4: Tables Verified */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Tables Verified</span>
            <TableProperties className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-bold tracking-tight text-foreground">
              {verifiedTables.length}
            </span>
            <span className="text-xs text-muted-foreground">/ {diagnostic.expectedTableCount || 16}</span>
            <span
              className={`ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                diagnostic.schemaUpToDate
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
              }`}
            >
              {diagnostic.schemaUpToDate ? "Verified" : "Incomplete"}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {diagnostic.schemaUpToDate ? "All essential schema tables found" : "Prisma db push or migration pending"}
          </p>
        </div>
      </div>

      {/* Sanitized Connection Parameters Card */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Sanitized Connection Parameters</h2>
          </div>
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
            <KeyRound className="h-3 w-3" />
            Passwords Permanently Redacted
          </span>
        </div>

        {/* Parameters Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-lg border bg-background p-3">
            <span className="text-[11px] font-medium text-muted-foreground">Host / Socket</span>
            <p className="mt-1 font-mono text-xs font-semibold truncate" title={diagnostic.connectionParams?.host}>
              {diagnostic.connectionParams?.host || diagnostic.host || "localhost"}
            </p>
          </div>

          <div className="rounded-lg border bg-background p-3">
            <span className="text-[11px] font-medium text-muted-foreground">Database</span>
            <p className="mt-1 font-mono text-xs font-semibold truncate">
              {diagnostic.connectionParams?.database || diagnostic.database || "pos"}
            </p>
          </div>

          <div className="rounded-lg border bg-background p-3">
            <span className="text-[11px] font-medium text-muted-foreground">User</span>
            <p className="mt-1 font-mono text-xs font-semibold truncate">
              {diagnostic.connectionParams?.user || "postgres"}
            </p>
          </div>

          <div className="rounded-lg border bg-background p-3">
            <span className="text-[11px] font-medium text-muted-foreground">Port</span>
            <p className="mt-1 font-mono text-xs font-semibold">
              {diagnostic.connectionParams?.port || "5432"}
            </p>
          </div>

          <div className="rounded-lg border bg-background p-3">
            <span className="text-[11px] font-medium text-muted-foreground">SSL / TLS Mode</span>
            <div className="mt-1 flex items-center gap-1">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  diagnostic.connectionParams?.sslEnabled ? "bg-emerald-500" : "bg-muted-foreground"
                }`}
              />
              <span className="text-xs font-semibold">
                {diagnostic.connectionParams?.sslEnabled ? "Active (Required)" : "Disabled"}
              </span>
            </div>
          </div>

          <div className="rounded-lg border bg-background p-3">
            <span className="text-[11px] font-medium text-muted-foreground">Socket Type</span>
            <p className="mt-1 text-xs font-semibold">
              {diagnostic.connectionParams?.isUnixSocket ? "Unix Domain Socket" : "TCP / IP"}
            </p>
          </div>
        </div>

        {/* Target String Preview */}
        <div className="rounded-lg border bg-muted/40 p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-0.5 overflow-hidden">
            <span className="text-[11px] font-medium text-muted-foreground">Sanitized Target URI</span>
            <p className="font-mono text-xs text-foreground truncate max-w-2xl select-all">
              {diagnostic.sanitizedTarget}
            </p>
          </div>
          <button
            onClick={() => copyToClipboard(diagnostic.sanitizedTarget)}
            className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors shrink-0"
          >
            {copiedTarget ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            <span>{copiedTarget ? "Copied" : "Copy URI"}</span>
          </button>
        </div>
      </div>

      {/* Schema & Table Health Checklist */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Schema &amp; Table Health Checklist</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Verifies that Prisma models map to existing tables in the active PostgreSQL database.
            </p>
          </div>

          {/* Filter Tabs */}
          <div className="inline-flex rounded-lg border bg-muted/40 p-1 text-xs">
            <button
              onClick={() => setTableFilter("all")}
              className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                tableFilter === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({diagnostic.coreTables?.length || 0})
            </button>
            <button
              onClick={() => setTableFilter("essential")}
              className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                tableFilter === "essential" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Essential ({diagnostic.coreTables?.filter((t) => t.essential).length || 0})
            </button>
            <button
              onClick={() => setTableFilter("missing")}
              className={`rounded-md px-2.5 py-1 font-medium transition-all ${
                tableFilter === "missing" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Missing ({missingTables.length})
            </button>
          </div>
        </div>

        {/* Table List */}
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/50 font-medium text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Table Name</th>
                <th className="px-4 py-2.5">Description</th>
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Row Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTables.map((table) => (
                <tr key={table.name} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5 font-mono font-semibold text-foreground flex items-center gap-2">
                    {table.exists ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-rose-500 shrink-0" />
                    )}
                    <span>{table.name}</span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{table.description}</td>
                  <td className="px-4 py-2.5">
                    {table.essential ? (
                      <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        Essential Core
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Feature Table
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {table.exists ? (
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                        Present
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400">
                        Missing
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-medium text-foreground">
                    {table.rowCount !== undefined ? table.rowCount.toLocaleString() : table.exists ? "—" : "0"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Connection Tester (Sandbox Mode) */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Manual Sandbox Connection Tester</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Test alternative PostgreSQL connection strings in sandbox mode without modifying your production environment or restarting the server.
          </p>
        </div>

        <form onSubmit={handleTestSandbox} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={sandboxUrl}
              onChange={(e) => setSandboxUrl(e.target.value)}
              placeholder="postgresql://user:password@host:5432/pos?sslmode=require"
              className="flex-1 rounded-lg border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <button
              type="submit"
              disabled={isTestingSandbox}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isTestingSandbox ? "animate-spin" : ""}`} />
              <span>{isTestingSandbox ? "Testing..." : "Test Connection"}</span>
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Tip: For Cloud SQL via unix domain sockets, use: <code className="font-mono">postgresql://user:password@/pos?host=/cloudsql/project:region:instance</code>
          </p>
        </form>

        {/* Sandbox Test Result Display */}
        {sandboxResult && (
          <div
            className={`rounded-lg border p-4 text-xs space-y-2 ${
              sandboxResult.ok
                ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-950 dark:text-emerald-200"
                : "border-rose-500/40 bg-rose-500/5 text-rose-950 dark:text-rose-200"
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {sandboxResult.ok ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Sandbox Connection Successful</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-rose-500" />
                  <span>Sandbox Connection Failed</span>
                </>
              )}
            </div>

            {sandboxResult.ok ? (
              <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4 font-mono text-[11px]">
                <div>
                  <span className="text-muted-foreground">Latency:</span> {sandboxResult.latencyMs} ms
                </div>
                <div>
                  <span className="text-muted-foreground">Tables:</span> {sandboxResult.tableCount} discovered
                </div>
                <div>
                  <span className="text-muted-foreground">SSL:</span> {sandboxResult.sslEnabled ? "Active" : "None"}
                </div>
                <div className="truncate" title={sandboxResult.serverVersion}>
                  <span className="text-muted-foreground">Version:</span> {sandboxResult.serverVersion}
                </div>
              </div>
            ) : (
              <p className="font-mono text-[11px] text-rose-600 dark:text-rose-400 break-words">
                {sandboxResult.error || "Connection timed out or failed"}
              </p>
            )}

            <p className="text-[10px] text-muted-foreground pt-1">
              * Note: Sandbox tests are executed in an isolated temporary connection pool and do not change your active configuration.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
