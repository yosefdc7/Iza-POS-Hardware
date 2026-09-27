import { CheckoutEngine } from "./checkout-engine";
import { OnlineCheckoutAdapter } from "./online-adapter";
import { OfflineCheckoutAdapter } from "./offline-adapter";
import { IndexedDBStorageAdapter, MemoryStorageAdapter } from "./storage-adapters";

export * from "./types";
export * from "./checkout-engine";
export * from "./online-adapter";
export * from "./offline-adapter";
export * from "./storage-adapters";

/**
 * Singleton checkout engine for register workflows, configured with default browser adapters.
 */
export const checkoutEngine = new CheckoutEngine(
  new OnlineCheckoutAdapter(),
  new OfflineCheckoutAdapter(new IndexedDBStorageAdapter())
);
