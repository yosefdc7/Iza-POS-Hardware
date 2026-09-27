// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ $transaction: vi.fn(), $queryRaw: vi.fn(), user: { count: vi.fn() } }));
vi.mock("@/lib/db", () => ({ prisma: db }));
import { bootstrapStore } from "@/lib/bootstrap";
import { GET as health } from "@/app/api/health/route";

describe("deployment readiness", () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.SETUP_TOKEN = "a".repeat(64); });
  it("rejects invalid setup tokens without touching the database", async () => {
    await expect(bootstrapStore({ token: "wrong", name: "Owner", email: "owner@example.com", password: "long-password-123", businessName: "Store" })).rejects.toMatchObject({ status: 403 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("rejects short administrator passwords", async () => {
    await expect(bootstrapStore({ token: process.env.SETUP_TOKEN, name: "Owner", email: "owner@example.com", password: "short", businessName: "Store" })).rejects.toMatchObject({ status: 400 });
  });
  it("serializes setup and rejects an initialized store", async () => {
    const tx = { $executeRaw: vi.fn(), user: { count: vi.fn().mockResolvedValue(1) } };
    db.$transaction.mockImplementation(fn => fn(tx));
    await expect(bootstrapStore({ token: process.env.SETUP_TOKEN, name: "Owner", email: "owner@example.com", password: "long-password-123", businessName: "Store" })).rejects.toMatchObject({ status: 409 });
    expect(tx.$executeRaw).toHaveBeenCalled();
  });
  it("does not report a database outage as healthy", async () => {
    db.$queryRaw.mockRejectedValue(new Error("private connection error"));
    const response = await health();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private connection error");
  });
  it("accepts an empty store when every required table and column is present", async () => {
    db.$queryRaw.mockResolvedValue(["User", "Account", "Session", "Verification", "BusinessSettings", "ReceiptSeries", "Product", "ProductPackaging", "Sale", "SaleItem", "Customer", "HeldOrder", "LoyaltyLog", "StockAdjustment", "Supplier", "Refund"].map(name => ({ name })));
    expect((await health()).status).toBe(200);
    expect(db.user.count).not.toHaveBeenCalled();
  });
});
