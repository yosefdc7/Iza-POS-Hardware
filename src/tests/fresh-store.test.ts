// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ user: { count: vi.fn(), create: vi.fn(), findMany: vi.fn() }, businessSettings: { findFirst: vi.fn(), create: vi.fn() }, receiptSeries: { findFirst: vi.fn(), create: vi.fn() } }));
vi.mock("@/lib/db", () => ({ prisma: db }));
import { GET } from "@/app/api/auth/staff/route";
beforeEach(() => { vi.clearAllMocks(); db.user.count.mockResolvedValue(0); db.user.findMany.mockResolvedValue([]); });
it("reading the login staff list never creates default credentials or store data", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(db.user.create).not.toHaveBeenCalled();
  expect(db.businessSettings.create).not.toHaveBeenCalled();
  expect(db.receiptSeries.create).not.toHaveBeenCalled();
});
