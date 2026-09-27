/**
 * Lightweight browser IndexedDB offline cache for the POS.
 * Replaces heavy WASM engines with 100% native browser storage (0 bundle overhead).
 *
 * Import this only in client components or hooks (never in server code).
 */

const DB_NAME = "izah-pos-offline";
const DB_VERSION = 1;

interface SyncQueueItem {
  id?: number;
  endpoint: string;
  method: string;
  payload: unknown;
  ownerUserId?: string;
  synced: boolean;
  createdAt: number;
}

export interface ProductCacheItem {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  price: number;
  stock: number;
  unit: string;
  quantityPrecision: number;
  category?: string | null;
  tag?: string | null;
  lowStockThreshold?: number;
  packagings?: Array<{
    id: string;
    name: string;
    conversionQty: number;
    price: number;
    barcode?: string | null;
  }>;
  updatedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB is only available in browser environment"));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("sync_queue")) {
        const queueStore = db.createObjectStore("sync_queue", {
          keyPath: "id",
          autoIncrement: true,
        });
        queueStore.createIndex("synced", "synced", { unique: false });
      }

      if (!db.objectStoreNames.contains("products_cache")) {
        db.createObjectStore("products_cache", { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Enqueue an offline write to be replayed when back online. */
export async function enqueueOfflineWrite(
  endpoint: string,
  method: string,
  payload: unknown
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sync_queue", "readwrite");
    const store = tx.objectStore("sync_queue");
    const item: SyncQueueItem = {
      endpoint,
      method,
      payload,
      ownerUserId: localStorage.getItem("izah_user_id") || undefined,
      synced: false,
      createdAt: Date.now(),
    };
    const req = store.add(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Return all pending (unsynced) items in the queue. */
export async function getPendingQueue(): Promise<
  { id: number; endpoint: string; method: string; payload: unknown; ownerUserId?: string }[]
> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sync_queue", "readonly");
    const store = tx.objectStore("sync_queue");
    const req = store.getAll();

    req.onsuccess = () => {
      const items: SyncQueueItem[] = req.result || [];
      const pending = items
        .filter((i) => !i.synced)
        .map((i) => ({
          id: i.id!,
          endpoint: i.endpoint,
          method: i.method,
          payload: i.payload,
          ownerUserId: i.ownerUserId,
        }));
      resolve(pending);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Mark a queued item as synced. */
export async function markSynced(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sync_queue", "readwrite");
    const store = tx.objectStore("sync_queue");
    const req = store.get(id);

    req.onsuccess = () => {
      const item = req.result as SyncQueueItem;
      if (item) {
        item.synced = true;
        store.put(item);
      }
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

/** Upsert a product into the local cache. */
export async function upsertProductCache(product: {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  price: number;
  stock: number;
  unit: string;
  quantityPrecision: number;
  category?: string | null;
  tag?: string | null;
  lowStockThreshold?: number;
  packagings?: Array<{
    id: string;
    name: string;
    conversionQty: number;
    price: number;
    barcode?: string | null;
  }>;
}): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("products_cache", "readwrite");
    const store = tx.objectStore("products_cache");
    const item: ProductCacheItem = {
      ...product,
      updatedAt: Date.now(),
    };
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Search the local product cache (offline fallback). */
export async function searchProductsOffline(query: string): Promise<
  {
    id: string;
    name: string;
    sku: string | null;
    barcode: string | null;
    price: number;
    stock: number;
    unit: string;
    quantityPrecision: number;
    category: string | null;
  }[]
> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("products_cache", "readonly");
    const store = tx.objectStore("products_cache");
    const req = store.getAll();

    req.onsuccess = () => {
      const all: ProductCacheItem[] = req.result || [];
      const q = query.toLowerCase().trim();
      const filtered = all
        .filter((p) => {
          if (!q) return true;
          return (
            p.name.toLowerCase().includes(q) ||
            p.sku?.toLowerCase().includes(q) ||
            p.barcode?.toLowerCase().includes(q)
          );
        })
        .slice(0, 20)
        .map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku ?? null,
          barcode: p.barcode ?? null,
          price: p.price,
          stock: p.stock,
          unit: p.unit ?? "pc",
          quantityPrecision: p.quantityPrecision ?? 0,
          category: p.category ?? null,
        }));
      resolve(filtered);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Retrieve a single product from the local cache. */
export async function getProductFromCache(id: string): Promise<ProductCacheItem | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("products_cache", "readonly");
    const store = tx.objectStore("products_cache");
    const req = store.get(id);
    req.onsuccess = () => resolve((req.result as ProductCacheItem) || null);
    req.onerror = () => reject(req.error);
  });
}

/** Decrement local stock for a product in cache. Returns updated stock & metadata, or null if not cached. */
export async function decrementProductStockInCache(
  productId: string,
  quantityToDeduct: number
): Promise<{ updatedStock: number; name: string; unit: string; lowStockThreshold: number } | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("products_cache", "readwrite");
    const store = tx.objectStore("products_cache");
    const req = store.get(productId);

    req.onsuccess = () => {
      const item = req.result as ProductCacheItem | undefined;
      if (!item) {
        resolve(null);
        return;
      }
      const current = typeof item.stock === "number" ? item.stock : parseFloat(String(item.stock)) || 0;
      const updatedStock = Math.max(0, current - quantityToDeduct);
      item.stock = updatedStock;
      item.updatedAt = Date.now();
      const putReq = store.put(item);
      putReq.onsuccess = () => {
        resolve({
          updatedStock,
          name: item.name,
          unit: item.unit ?? "pc",
          lowStockThreshold: typeof item.lowStockThreshold === "number" ? item.lowStockThreshold : 5,
        });
      };
      putReq.onerror = () => reject(putReq.error);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Allocate a sequential offline receipt number for a series. */
export function allocateOfflineReceiptNumber(seriesName = "POS"): number {
  if (typeof window === "undefined") return 1;
  const sanitized = seriesName.toUpperCase().replace(/[^A-Z0-9]/g, "_") || "POS";
  const key = `izah_offline_seq_${sanitized}`;
  try {
    const current = parseInt(localStorage.getItem(key) || "0", 10);
    const next = isNaN(current) ? 1 : current + 1;
    localStorage.setItem(key, String(next));
    return next;
  } catch {
    return Math.floor(Math.random() * 900000) + 100000;
  }
}

