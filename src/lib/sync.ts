/**
 * Sync queue — replay offline writes to the server when back online.
 *
 * Client-side only. Import via dynamic import or inside useEffect.
 */

import { getPendingQueue, markSynced } from "./pglite";

export type SyncStatus = "idle" | "syncing" | "synced" | "error" | "blocked";

let syncStatus: SyncStatus = "idle";
const listeners = new Set<(status: SyncStatus) => void>();
let replayInFlight: Promise<void> | null = null;

function emit(s: SyncStatus) {
  syncStatus = s;
  listeners.forEach((fn) => fn(s));
}

export function getSyncStatus(): SyncStatus {
  return syncStatus;
}

export function onSyncStatusChange(fn: (s: SyncStatus) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Attempt to replay all pending offline writes.
 * Call this when the browser comes back online.
 */
export function replayOfflineQueue(): Promise<void> {
  // The initial mount check and the browser's `online` event can arrive at
  // the same time. Serialize replays so one queued sale cannot be submitted
  // twice before the first run marks it as synced.
  if (replayInFlight) return replayInFlight;

  replayInFlight = (async () => {
    const pending = await getPendingQueue();
    if (pending.length === 0) {
      emit("synced");
      return;
    }

    emit("syncing");
    let hasError = false;
    let blocked = false;

    for (const item of pending) {
      if (item.ownerUserId && item.ownerUserId !== localStorage.getItem("izah_user_id")) { blocked = true; continue; }
      try {
        const res = await fetch(item.endpoint, {
          method: item.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.payload),
        });

        if (res.ok) {
          await markSynced(item.id);
        } else {
          hasError = true;
          console.warn(`[sync] Failed ${item.method} ${item.endpoint}: ${res.status}`);
        }
      } catch (err) {
        hasError = true;
        console.warn(`[sync] Network error replaying item ${item.id}:`, err);
      }
    }

    emit(hasError ? "error" : blocked ? "blocked" : "synced");
  })().finally(() => {
    replayInFlight = null;
  });

  return replayInFlight;
}

/**
 * Seed the local PGLite product cache from the server.
 * Run once on app load (or periodically when online).
 */
export async function seedProductCache(): Promise<void> {
  try {
    const res = await fetch("/api/products/search?q=&limit=200");
    if (!res.ok) return;

    const data = (await res.json()) as {
      id: string;
      name: string;
      sku?: string | null;
      barcode?: string | null;
      price: number;
      stock: number;
      unit: string;
      quantityPrecision: number;
      category?: string | null;
    }[];

    const { upsertProductCache } = await import("./pglite");
    for (const product of data) {
      await upsertProductCache(product);
    }
  } catch {
    // Silently ignore — we're seeding a cache, not critical
  }
}
