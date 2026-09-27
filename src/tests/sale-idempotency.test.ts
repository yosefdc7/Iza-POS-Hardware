// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { findSaleRetry, fingerprintSale } from "@/lib/sale-idempotency";

describe("sale retries", () => {
  it("fingerprints equivalent JSON regardless of object key order", () => {
    expect(fingerprintSale({ a: 1, b: { c: 2 } })).toBe(fingerprintSale({ b: { c: 2 }, a: 1 }));
  });
  it("returns the committed sale after acquiring a transaction lock", async () => {
    const existing = { id: "sale-1", userId: "u1", requestFingerprint: "fp", items: [] };
    const tx = { $executeRaw: vi.fn(), sale: { findUnique: vi.fn().mockResolvedValue(existing) } };
    expect(await findSaleRetry(tx as never, "request-1", "u1", "fp")).toBe(existing);
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });
  it("rejects reuse by another user or with another payload", async () => {
    const tx = { $executeRaw: vi.fn(), sale: { findUnique: vi.fn().mockResolvedValue({ userId: "u1", requestFingerprint: "fp" }) } };
    await expect(findSaleRetry(tx as never, "r", "u2", "fp")).rejects.toMatchObject({ status: 409 });
    await expect(findSaleRetry(tx as never, "r", "u1", "changed")).rejects.toMatchObject({ status: 409 });
  });
});
