import { timingSafeEqual } from "node:crypto";
import * as z from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth-passwords";
export class BootstrapError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
const inputSchema = z.object({
  token: z.string(), name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  password: z.string().min(12).max(256), businessName: z.string().trim().min(1).max(150),
});
export async function bootstrapStore(input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new BootstrapError("Enter valid details and a password of at least 12 characters.", 400);
  const { token, name, email, password, businessName } = parsed.data;
  const expected = process.env.SETUP_TOKEN;
  if (!expected || Buffer.byteLength(token) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) throw new BootstrapError("This setup link is invalid.", 403);
  const passwordHash = hashPassword(password);
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(72927101)`;
    if (await tx.user.count({ where: { role: "ADMIN" } })) throw new BootstrapError("This store is already initialized. Sign in instead.", 409);
    const user = await tx.user.create({ data: { name, email, role: "ADMIN", accounts: { create: { accountId: email, providerId: "credential", password: passwordHash } } } });
    await tx.businessSettings.upsert({ where: { id: "singleton" }, create: { id: "singleton", name: businessName, setupComplete: true, storageProvider: "supabase", storageBucket: process.env.SUPABASE_STORAGE_BUCKET || "product-images" }, update: { name: businessName, setupComplete: true } });
    await tx.receiptSeries.upsert({ where: { name: "DEFAULT" }, create: { name: "DEFAULT", active: true, nextNumber: 1 }, update: { active: true } });
    return { id: user.id };
  });
}
