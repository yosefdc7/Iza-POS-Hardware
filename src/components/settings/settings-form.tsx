"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { updateSettings } from "@/app/actions/settings-actions";
import { setLocale } from "@/app/actions/locale-actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const settingsSchema = z.object({
  name: z.string().min(1, "Business name is required"),
  logoUrl: z.string().url().optional().or(z.literal("")),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color"),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color"),
  currency: z.string().min(1).max(5),
  currencyDecimals: z.number().int().min(0).max(4),
  taxRate: z.number().min(0).max(100),
  taxName: z.string().min(1),
  receiptFooter: z.string().max(500),
  language: z.string().min(2).max(10),
  businessTimezone: z.string().min(1),
  // Loyalty
  loyaltyEnabled: z.boolean().optional(),
  loyaltyEarnRate: z.number().min(0),
  loyaltyRedeemValue: z.number().min(1),
  // Inventory
  lowStockThreshold: z.number().int().min(0),
  // POS Security
  posAutoLockMinutes: z.number().int().min(0).default(0),
  // Storage
  storageProvider: z.string().default("local"),
  storageRegion: z.string().default(""),
  storageBucket: z.string().default(""),
  storageEndpoint: z.string().default(""),
  storageAccessKey: z.string().default(""),
  storageSecretKey: z.string().default(""),
  storagePublicUrl: z.string().default(""),
});

// Explicitly type the form values to work around Zod v4 + react-hook-form type inference
// (Zod v4 .default() and .optional() produce input types of T | undefined, which
//  react-hook-form's Resolver generic rejects — so we define the shape manually)
type SettingsFormValues = {
  name: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  currency: string;
  currencyDecimals: number;
  taxRate: number;
  taxName: string;
  receiptFooter: string;
  language: string;
  businessTimezone: string;
  loyaltyEnabled?: boolean;
  loyaltyEarnRate: number;
  loyaltyRedeemValue: number;
  lowStockThreshold: number;
  posAutoLockMinutes: number;
  storageProvider: string;
  storageRegion: string;
  storageBucket: string;
  storageEndpoint: string;
  storageAccessKey: string;
  storageSecretKey: string;
  storagePublicUrl: string;
};

interface Props {
  settings: {
    name: string;
    logoUrl: string | null;
    primaryColor: string;
    accentColor: string;
    currency: string;
    currencyDecimals: number;
    taxRate: { toString(): string };
    taxName: string;
    receiptFooter: string;
    language: string;
    businessTimezone: string;
    loyaltyEnabled: boolean;
    loyaltyEarnRate: { toString(): string };
    loyaltyRedeemValue: { toString(): string };
    lowStockThreshold: number;
    posAutoLockMinutes?: number;
    // Storage
    storageProvider: string;
    storageRegion: string | null;
    storageBucket: string | null;
    storageEndpoint: string | null;
    storageAccessKey: string | null;
    hasStorageSecretKey: boolean;
    storagePublicUrl: string | null;
  };
}

export function SettingsForm({ settings }: Props) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SettingsFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(settingsSchema) as any,
    defaultValues: {
      name: settings.name,
      logoUrl: settings.logoUrl ?? "",
      primaryColor: settings.primaryColor,
      accentColor: settings.accentColor,
      currency: settings.currency,
      currencyDecimals: settings.currencyDecimals,
      taxRate: parseFloat(settings.taxRate.toString()) * 100,
      taxName: settings.taxName,
      receiptFooter: settings.receiptFooter,
      language: settings.language,
      businessTimezone: settings.businessTimezone,
      loyaltyEnabled: settings.loyaltyEnabled,
      loyaltyEarnRate: parseFloat(settings.loyaltyEarnRate.toString()),
      loyaltyRedeemValue: parseFloat(settings.loyaltyRedeemValue.toString()),
      lowStockThreshold: settings.lowStockThreshold,
      posAutoLockMinutes: settings.posAutoLockMinutes ?? 0,
      // Storage — secret key intentionally never pre-filled (security)
      storageProvider:
        process.env.NODE_ENV === "production" ? "supabase" : settings.storageProvider,
      storageRegion: settings.storageRegion ?? "",
      storageBucket: settings.storageBucket ?? "",
      storageEndpoint: settings.storageEndpoint ?? "",
      storageAccessKey: settings.storageAccessKey ?? "",
      storageSecretKey: "",
      storagePublicUrl: settings.storagePublicUrl ?? "",
    },
  });

  const storageProvider = useWatch({ control, name: "storageProvider" });
  const isProduction = process.env.NODE_ENV === "production";

  async function onSubmit(values: SettingsFormValues) {
    const fd = new FormData();
    Object.entries(values).forEach(([k, v]) => fd.append(k, String(v ?? "")));
    fd.set("loyaltyEnabled", values.loyaltyEnabled ? "true" : "false");
    try {
      await updateSettings(fd);
      // Update locale cookie when language changes
      await setLocale(values.language);
      toast.success("Settings saved successfully");
      router.refresh();
    } catch {
      toast.error("Failed to save settings. Please try again.");
    }
  }

  function field(
    label: string,
    name: keyof SettingsFormValues,
    props?: React.InputHTMLAttributes<HTMLInputElement>
  ) {
    const isNum = props?.type === "number";
    return (
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{label}</label>
        <input
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...register(name as any, isNum ? { valueAsNumber: true } : undefined)}
          {...props}
          className={cn(
            "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            errors[name] && "border-destructive"
          )}
        />
        {errors[name] && (
          <p className="text-destructive text-xs">{String(errors[name]?.message)}</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Business */}
      <section className="space-y-4">
        <h2 className="border-b pb-2 text-base font-semibold">Business</h2>
        {field("Business Name *", "name", { placeholder: "My Store" })}
        {field("Logo URL", "logoUrl", { type: "url", placeholder: "https://…" })}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Business Time Zone</label>
          <select
            {...register("businessTimezone")}
            className="border-input bg-background flex h-10 w-full rounded-md border px-3 text-sm"
          >
            <option value="Asia/Manila">Asia/Manila</option>
            <option value="Asia/Singapore">Asia/Singapore</option>
            <option value="UTC">UTC</option>
            <option value="America/New_York">America/New_York</option>
            <option value="Europe/London">Europe/London</option>
          </select>
        </div>
      </section>

      {/* Appearance */}
      <section className="space-y-4">
        <h2 className="border-b pb-2 text-base font-semibold">Appearance</h2>
        <div className="grid grid-cols-2 gap-4">
          {field("Primary Color", "primaryColor", { type: "color" })}
          {field("Accent Color", "accentColor", { type: "color" })}
        </div>
      </section>

      {/* Currency & Tax */}
      <section className="space-y-4">
        <h2 className="border-b pb-2 text-base font-semibold">Currency & Tax</h2>
        <div className="grid grid-cols-2 gap-4">
          {field("Currency Symbol", "currency", { placeholder: "₱" })}
          {field("Decimal Places", "currencyDecimals", { type: "number", min: "0", max: "4" })}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {field("Tax Rate (%)", "taxRate", { type: "number", step: "0.01", min: "0", max: "100" })}
          {field("Tax Name", "taxName", { placeholder: "VAT" })}
        </div>
      </section>

      {/* Receipt */}
      <section className="space-y-4">
        <h2 className="border-b pb-2 text-base font-semibold">Receipt</h2>
        {field("Footer Text", "receiptFooter", { placeholder: "Thank you!" })}
      </section>

      {/* Language */}
      <section className="space-y-4">
        <h2 className="border-b pb-2 text-base font-semibold">Language</h2>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Language</label>
          <select
            {...register("language")}
            className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            <option value="en">English</option>
            <option value="si">සිංහල (Sinhala)</option>
            <option value="ta">தமிழ் (Tamil)</option>
            <option value="ar">العربية (Arabic)</option>
            <option value="zh">中文 (Chinese)</option>
            <option value="de">Deutsch (German)</option>
            <option value="es">Español (Spanish)</option>
            <option value="fr">Français (French)</option>
            <option value="hi">हिन्दी (Hindi)</option>
            <option value="id">Bahasa Indonesia</option>
            <option value="ja">日本語 (Japanese)</option>
            <option value="ko">한국어 (Korean)</option>
            <option value="pt">Português (Portuguese)</option>
            <option value="ru">Русский (Russian)</option>
          </select>
        </div>
      </section>

      {/* Loyalty */}
      <section className="space-y-4">
        <h2 className="border-b pb-2 text-base font-semibold">Loyalty Program</h2>
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">Enable Loyalty Points</p>
            <p className="text-muted-foreground text-xs">
              Let customers earn and redeem points on purchases
            </p>
          </div>
          <input
            type="checkbox"
            {...register("loyaltyEnabled")}
            className="border-input accent-primary h-4 w-4 cursor-pointer rounded"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          {field("Earn Rate (pts per $1)", "loyaltyEarnRate", {
            type: "number",
            step: "0.01",
            min: "0",
            placeholder: "1",
          })}
          {field("Redeem Rate (pts per $1 off)", "loyaltyRedeemValue", {
            type: "number",
            step: "1",
            min: "1",
            placeholder: "100",
          })}
        </div>
        <p className="text-muted-foreground text-xs">
          Example: Earn Rate = 1, Redeem Rate = 100 → customer earns 1 pt per $1 spent, and 100 pts
          = $1 discount.
        </p>
      </section>

      {/* Inventory */}
      <section className="space-y-4">
        <h2 className="border-b pb-2 text-base font-semibold">Inventory</h2>
        {field("Low Stock Threshold (default)", "lowStockThreshold", {
          type: "number",
          min: "0",
          step: "1",
          placeholder: "5",
        })}
        <p className="text-muted-foreground text-xs">
          Products with stock at or below this level will show low-stock alerts.
        </p>

        {/* Low-stock email alert — placeholder UI, actual emails ship in v0.3 */}
        <div className="space-y-3 rounded-lg border border-dashed p-4 opacity-80">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">Low-Stock Email Alerts</h3>
            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
              Coming in v0.3
            </span>
          </div>
          <p className="text-muted-foreground text-xs">
            Receive an email when a product’s stock drops to or below the threshold above.
          </p>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <input
              type="email"
              disabled
              placeholder="alert@example.com"
              className="border-input bg-muted text-muted-foreground h-9 w-full flex-1 cursor-not-allowed rounded-md border px-3 text-sm"
            />
            <label className="flex shrink-0 cursor-not-allowed items-center gap-2 opacity-60">
              <input type="checkbox" disabled className="accent-primary" />
              <span className="text-sm">Enabled</span>
            </label>
          </div>
        </div>
      </section>

      {/* Image Storage */}
      <section className="space-y-4">
        <h2 className="border-b pb-2 text-base font-semibold">Image Storage</h2>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Storage Provider</label>
          <select
            {...register("storageProvider")}
            className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            {!isProduction && (
              <option value="local">Local (public/uploads/) — self-hosted only</option>
            )}
            <option value="supabase">Supabase Storage</option>
          </select>
          <p className="text-muted-foreground text-xs">
            Where product images are stored after upload. Supabase Storage is the hosted option for
            this deployment.
          </p>
        </div>

        {storageProvider === "local" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
            Files are saved to{" "}
            <code className="rounded bg-amber-100 px-1 font-mono dark:bg-amber-900">
              public/uploads/
            </code>{" "}
            on your server. This does <strong>not</strong> work on serverless platforms like Netlify
            — choose Supabase Storage instead.
          </div>
        )}

        {storageProvider === "supabase" && (
          <div className="space-y-4">
            {field("Bucket Name", "storageBucket", { placeholder: "product-images" })}
            <p className="text-muted-foreground text-xs">
              Set <code className="bg-muted rounded px-1 font-mono">SUPABASE_URL</code>,{" "}
              <code className="bg-muted rounded px-1 font-mono">SUPABASE_SERVICE_ROLE_KEY</code>,
              and <code className="bg-muted rounded px-1 font-mono">SUPABASE_STORAGE_BUCKET</code>{" "}
              in the hosting provider. The service-role key is server-only and is never stored in
              the database or sent to the browser.
            </p>
          </div>
        )}
      </section>

      {/* POS Terminal Security */}
      <section className="space-y-4">
        <h2 className="border-b pb-2 text-base font-semibold">POS Terminal Security</h2>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Inactivity Auto-Lock Timer</label>
          <select
            {...register("posAutoLockMinutes", { valueAsNumber: true })}
            className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            <option value={0}>Disabled (Manual Lock Only)</option>
            <option value={1}>1 Minute</option>
            <option value={5}>5 Minutes</option>
            <option value={15}>15 Minutes</option>
            <option value={30}>30 Minutes</option>
          </select>
          <p className="text-muted-foreground text-xs">
            Automatically lock the POS register and require a 4-digit PIN when idle.
          </p>
        </div>
      </section>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center rounded-md px-6 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {isSubmitting ? "Saving…" : "Save Settings"}
        </button>
      </div>
    </form>
  );
}
