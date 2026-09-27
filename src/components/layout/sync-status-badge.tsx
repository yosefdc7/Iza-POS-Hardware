"use client";

import { useOnlineStatus } from "@/hooks/use-online-status";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";

export function SyncStatusBadge() {
  const status = useOnlineStatus();

  const config = {
    blocked: { label: "Sign in as original cashier to sync", icon: WifiOff, className: "bg-yellow-100 text-yellow-800" },
    error: { label: "Sync needs retry", icon: WifiOff, className: "bg-yellow-100 text-yellow-800" },
    offline: {
      label: "Offline",
      icon: WifiOff,
      className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    },
    syncing: {
      label: "Syncing",
      icon: RefreshCw,
      className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    },
    synced: {
      label: "Synced",
      icon: Wifi,
      className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    },
  }[status];

  const Icon = config.icon;

  return (
    <span
      data-sync-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        config.className
      )}
    >
      <Icon className={cn("h-3 w-3", status === "syncing" && "animate-spin")} />
      {config.label}
    </span>
  );
}
