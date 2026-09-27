import { CheckoutPort, CheckoutIntent, CheckoutResult } from "./types";

/**
 * Deep Checkout Module coordinator.
 * Hides network boundaries, fallback detection, stock accounting, and receipt formatting behind a single interface.
 */
export class CheckoutEngine implements CheckoutPort {
  constructor(
    private onlinePort: CheckoutPort,
    private offlinePort: CheckoutPort
  ) {}

  async execute(intent: CheckoutIntent): Promise<CheckoutResult> {
    const isExplicitlyOffline = typeof navigator !== "undefined" && !navigator.onLine;

    if (isExplicitlyOffline) {
      return this.offlinePort.execute(intent);
    }

    try {
      return await this.onlinePort.execute(intent);
    } catch (error) {
      const isNetworkError =
        error instanceof TypeError ||
        (typeof navigator !== "undefined" && !navigator.onLine) ||
        (error instanceof Error &&
          (error.message.toLowerCase().includes("fetch failed") ||
            error.message.toLowerCase().includes("networkerror") ||
            error.message.toLowerCase().includes("failed to fetch") ||
            error.message.toLowerCase().includes("load failed")));

      if (isNetworkError) {
        return this.offlinePort.execute(intent);
      }

      // Re-throw authoritative business/validation exceptions (e.g. 400 Bad Request)
      throw error;
    }
  }
}
