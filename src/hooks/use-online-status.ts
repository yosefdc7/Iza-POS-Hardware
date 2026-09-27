"use client";

import { useEffect, useState } from "react";
import type { SyncStatus as QueueSyncStatus } from "@/lib/sync";

export type SyncStatus = "offline" | "syncing" | "synced" | "blocked" | "error";

/** Ping our own server to determine real connectivity (navigator.onLine is
 *  unreliable on Windows when there is no internet gateway). */
async function canReachServer(): Promise<boolean> {
  try {
    const res = await fetch("/api/ping", {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function useOnlineStatus(): SyncStatus {
  // Always start as "synced" — no hydration mismatch, no flash.
  // The useEffect below does a real connectivity check immediately after mount.
  const [queueState, setQueueState] = useState<QueueSyncStatus>("idle");
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    async function handleOnline() {
      const reachable = await canReachServer();
      setIsOnline(reachable);
      if (!reachable) return;
      setIsSyncing(true);

      try {
        const { replayOfflineQueue, onSyncStatusChange } = await import("@/lib/sync");

        const unsub = onSyncStatusChange((s: QueueSyncStatus) => {
          setQueueState(s);
          setIsSyncing(s === "syncing");
          if (s === "synced" || s === "error" || s === "blocked") {
            unsub();
          }
        });

        await replayOfflineQueue();
      } catch {
        setTimeout(() => setIsSyncing(false), 2000);
      }
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Replay pending writes immediately when a tab reloads while online.
    void handleOnline();

    // Seed product cache on first load if online
    canReachServer().then((ok) => {
      if (ok) {
        import("@/lib/sync").then(({ seedProductCache }) => seedProductCache()).catch(() => {});
      }
    });

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOnline) return "offline";
  if (isSyncing) return "syncing";
  if (queueState === "blocked" || queueState === "error") return queueState;
  return "synced";
}
