import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
export function fingerprintSale(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
export class SaleRetryConflict extends Error {
  status = 409;
  constructor() { super("This checkout identifier has already been used for another request."); }
}
export async function findSaleRetry(tx: Prisma.TransactionClient, id: string, userId: string, fingerprint: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
  const sale = await tx.sale.findUnique({ where: { clientRequestId: id }, include: { items: true } });
  if (sale && (sale.userId !== userId || sale.requestFingerprint !== fingerprint)) throw new SaleRetryConflict();
  return sale;
}
