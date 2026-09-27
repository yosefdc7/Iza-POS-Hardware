import {
  getProductFromCache,
  decrementProductStockInCache,
  enqueueOfflineWrite,
  allocateOfflineReceiptNumber,
} from "@/lib/pglite";
import { pendingCheckout, completeCheckout } from "@/lib/browser-session";
import { CheckoutStoragePort, CachedProductRecord } from "./types";

/**
 * Storage adapter targeting native browser IndexedDB and localStorage.
 */
export class IndexedDBStorageAdapter implements CheckoutStoragePort {
  async getProduct(id: string): Promise<CachedProductRecord | null> {
    const item = await getProductFromCache(id);
    if (!item) return null;
    return {
      id: item.id,
      name: item.name,
      price: item.price,
      stock: item.stock,
      unit: item.unit,
      lowStockThreshold: item.lowStockThreshold,
      quantityPrecision: item.quantityPrecision,
    };
  }

  async decrementStock(
    id: string,
    qty: number
  ): Promise<{ updatedStock: number; name: string; unit: string; lowStockThreshold: number } | null> {
    return decrementProductStockInCache(id, qty);
  }

  async enqueueSyncItem(
    endpoint: string,
    method: string,
    payload: unknown,
    _userId?: string
  ): Promise<void> {
    await enqueueOfflineWrite(endpoint, method, payload);
  }

  allocateReceiptSequence(seriesName: string): number {
    return allocateOfflineReceiptNumber(seriesName);
  }

  recordPendingCheckout(userId: string, payload: unknown): { id: string } {
    return pendingCheckout(userId, (payload || {}) as Record<string, unknown>);
  }

  completeCheckoutSession(userId: string): void {
    completeCheckout(userId);
  }
}

/**
 * In-memory storage adapter for fast unit tests without browser runtime dependencies.
 */
export class MemoryStorageAdapter implements CheckoutStoragePort {
  private products = new Map<string, CachedProductRecord>();
  private queue: Array<{ endpoint: string; method: string; payload: unknown; userId?: string }> = [];
  private sequences = new Map<string, number>();
  private pending = new Map<string, { id: string; payload: unknown }>();

  constructor(initialProducts: CachedProductRecord[] = []) {
    for (const p of initialProducts) {
      this.products.set(p.id, { ...p });
    }
  }

  setProduct(product: CachedProductRecord): void {
    this.products.set(product.id, { ...product });
  }

  getEnqueuedItems() {
    return [...this.queue];
  }

  async getProduct(id: string): Promise<CachedProductRecord | null> {
    const item = this.products.get(id);
    return item ? { ...item } : null;
  }

  async decrementStock(
    id: string,
    qty: number
  ): Promise<{ updatedStock: number; name: string; unit: string; lowStockThreshold: number } | null> {
    const item = this.products.get(id);
    if (!item) return null;
    item.stock = Math.max(0, item.stock - qty);
    return {
      updatedStock: item.stock,
      name: item.name,
      unit: item.unit,
      lowStockThreshold: item.lowStockThreshold ?? 5,
    };
  }

  async enqueueSyncItem(
    endpoint: string,
    method: string,
    payload: unknown,
    userId?: string
  ): Promise<void> {
    this.queue.push({ endpoint, method, payload, userId });
  }

  allocateReceiptSequence(seriesName: string): number {
    const current = this.sequences.get(seriesName) ?? 0;
    const next = current + 1;
    this.sequences.set(seriesName, next);
    return next;
  }

  recordPendingCheckout(userId: string, payload: unknown): { id: string } {
    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.pending.set(userId, { id, payload });
    return { id };
  }

  completeCheckoutSession(userId: string): void {
    this.pending.delete(userId);
  }
}
