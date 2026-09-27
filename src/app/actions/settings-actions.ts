"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/db";
import { isValidTimeZone } from "@/lib/daily-ledger";

export async function updateSettings(formData: FormData) {
  await requireAdmin();
  const raw = Object.fromEntries(formData.entries());
  const taxRatePercent = parseFloat(raw.taxRate as string) || 0;

  const requestedStorageProvider = (raw.storageProvider as string) || "local";
  const isProduction = (process.env.NODE_ENV as string | undefined) === "production";
  const storageProvider = isProduction
    ? "supabase"
    : requestedStorageProvider === "supabase"
      ? "supabase"
      : "local";

  const shared = {
    name: (raw.name as string) || "My Store",
    logoUrl: (raw.logoUrl as string) || null,
    primaryColor: (raw.primaryColor as string) || "#18181b",
    accentColor: (raw.accentColor as string) || "#6366f1",
    currency: (raw.currency as string) || "₱",
    currencyDecimals: parseInt(raw.currencyDecimals as string, 10) || 2,
    taxRate: taxRatePercent / 100,
    taxName: (raw.taxName as string) || "Tax",
    receiptFooter: (raw.receiptFooter as string) || "",
    language: (raw.language as string) || "en",
    businessTimezone: (raw.businessTimezone as string) || "Asia/Manila",
    loyaltyEnabled: raw.loyaltyEnabled === "true",
    loyaltyEarnRate: parseFloat(raw.loyaltyEarnRate as string) || 1,
    loyaltyRedeemValue: parseFloat(raw.loyaltyRedeemValue as string) || 100,
    lowStockThreshold: parseInt(raw.lowStockThreshold as string, 10) || 5,
    posAutoLockMinutes: parseInt(raw.posAutoLockMinutes as string, 10) || 0,
    // Storage
    storageProvider,
    storageRegion: null,
    storageBucket:
      storageProvider === "supabase"
        ? (raw.storageBucket as string) || process.env.SUPABASE_STORAGE_BUCKET || null
        : null,
    storageEndpoint: null,
    storageAccessKey: null,
    storagePublicUrl: (raw.storagePublicUrl as string) || null,
    // Credentials are supplied through the hosting environment, never stored
    // in the BusinessSettings compatibility columns.
    storageSecretKey: null,
  };

  if (!isValidTimeZone(shared.businessTimezone)) {
    throw new Error("Invalid business time zone");
  }

  await prisma.businessSettings.upsert({
    where: { id: "singleton" },
    create: shared,
    update: shared,
  });

  revalidatePath("/settings");
  revalidatePath("/pos");
}
