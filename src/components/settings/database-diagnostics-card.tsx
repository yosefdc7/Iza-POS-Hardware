"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Database, Activity, CheckCircle2, AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import type { DatabaseDiagnosticResult } from "@/lib/db";

export function DatabaseDiagnosticsCard() {
  const [diagnostic, setDiagnostic] = useState<DatabaseDiagnosticResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/diagnostics/database")
      .then((res) => res.json())
      .then((data) => {
        setDiagnostic(data);
      })
      .catch((err) => {
        console.error("Failed to load initial database diagnostics", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const isConnected = diagnostic?.ok ?? false;
  const engineLabel =
    diagnostic?.engine === "postgresql"
      ? "PostgreSQL"
      : diagnostic?.engine === "pglite"
        ? "PGlite (Embedded)"
        : "Database Engine";

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm transition-all hover:border-primary/40">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Database &amp; System Diagnostics</h2>
            {loading ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                <RefreshCw className="h-3 w-3 animate-spin" /> Checking
              </span>
            ) : isConnected ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-3 w-3" /> Attention Required
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Verify live PostgreSQL connectivity, query round-trip latency, core schema inventory, and environment parameters.
          </p>
        </div>

        <Link
          href="/settings/diagnosis"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Activity className="h-4 w-4" />
          <span>Run Full Diagnostics</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {diagnostic && !loading && (
        <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
          <div className="rounded-lg border bg-background/50 p-2.5">
            <span className="text-[11px] font-medium text-muted-foreground">Engine</span>
            <p className="font-semibold text-xs text-foreground truncate">{engineLabel}</p>
          </div>
          <div className="rounded-lg border bg-background/50 p-2.5">
            <span className="text-[11px] font-medium text-muted-foreground">Latency</span>
            <p className="font-semibold text-xs font-mono text-foreground">
              {diagnostic.latencyMs !== undefined ? `${diagnostic.latencyMs} ms` : "—"}
            </p>
          </div>
          <div className="rounded-lg border bg-background/50 p-2.5">
            <span className="text-[11px] font-medium text-muted-foreground">Tables Verified</span>
            <p className="font-semibold text-xs text-foreground">
              {diagnostic.coreTables ? `${diagnostic.coreTables.filter((t) => t.exists).length} / ${diagnostic.expectedTableCount ?? 16}` : "—"}
            </p>
          </div>
          <div className="rounded-lg border bg-background/50 p-2.5">
            <span className="text-[11px] font-medium text-muted-foreground">SSL / TLS</span>
            <p className="font-semibold text-xs text-foreground">
              {diagnostic.sslEnabled ? "Enabled" : "Disabled (Direct)"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
