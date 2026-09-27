"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { productFormSchema, type ProductFormValues } from "@/lib/validations/product";
import { createProduct, updateProduct } from "@/app/actions/product-actions";
import { cn } from "@/lib/utils";
import { Upload, Image as ImageIcon, Package, Calculator, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_HARDWARE_UNITS, UnitOption, computePackagingPricing } from "@/lib/hardware-units";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: { toString(): string };
  cost: { toString(): string } | null;
  stock: { toString(): string };
  unit: string;
  quantityPrecision: number;
  category: string | null;
  tag?: string | null;
  imageUrl: string | null;
  lowStockThreshold: { toString(): string };
  active: boolean;
}

interface ProductFormProps {
  product?: Product;
  isStaff?: boolean;
}

export function ProductForm({ product, isStaff = false }: ProductFormProps) {
  const isEdit = !!product;
  const [reason, setReason] = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(product?.imageUrl ?? null);

  // Tag classification state
  const [customTags, setCustomTags] = useState<string[]>(product?.tag ? [product.tag] : []);
  const [showCustomTag, setShowCustomTag] = useState(false);
  const [customTagInput, setCustomTagInput] = useState("");

  // Hardware units state
  const [units, setUnits] = useState<UnitOption[]>(DEFAULT_HARDWARE_UNITS);
  const [showCustomUnit, setShowCustomUnit] = useState(false);
  const [customUnitInput, setCustomUnitInput] = useState("");

  // Inline Box packaging state (when creating new items)
  const [hasPackaging, setHasPackaging] = useState(false);
  const [packName, setPackName] = useState("Box");
  const [packConversionQty, setPackConversionQty] = useState("100");
  const [packPrice, setPackPrice] = useState("");
  const [packCost, setPackCost] = useState("");
  const [packBarcode, setPackBarcode] = useState("");

  const {
    register: registerField,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors, isSubmitting },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<ProductFormValues, any, any>({
    resolver: zodResolver(productFormSchema) as any,
    defaultValues: product
      ? {
          name: product.name,
          sku: product.sku ?? "",
          barcode: product.barcode ?? "",
          price: parseFloat(product.price.toString()),
          cost: product.cost ? parseFloat(product.cost.toString()) : undefined,
          stock: parseFloat(String(product.stock)),
          unit: product.unit,
          quantityPrecision: product.quantityPrecision,
          category: product.category ?? "",
          tag: product.tag ?? "",
          lowStockThreshold: parseFloat(String(product.lowStockThreshold)),
          imageUrl: product.imageUrl ?? "",
          active: product.active,
        }
      : { stock: 0, unit: "pc", tag: "", quantityPrecision: 0, lowStockThreshold: 5, active: true },
  });

  const watchedPrice = watch("price") || 0;
  const watchedCost = watch("cost") || 0;
  const watchedUnit = watch("unit") || "pc";

  // Load hardware units list
  useEffect(() => {
    fetch("/api/units")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.units?.length) {
          setUnits(data.units);
        }
      })
      .catch(() => {});
  }, []);

  // Compute live packaging math
  const math = computePackagingPricing(
    parseFloat(packConversionQty) || 1,
    watchedPrice ? parseFloat(String(watchedPrice)) : undefined,
    packPrice ? parseFloat(packPrice) : undefined,
    packCost ? parseFloat(packCost) : undefined
  );

  async function handleAddCustomUnit(e: React.FormEvent) {
    e.preventDefault();
    const code = customUnitInput.trim().toLowerCase();
    if (!code) return;

    try {
      const res = await fetch("/api/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: code, label: `${code} (${code})`, category: "Custom" }),
      });
      if (res.ok) {
        toast.success(`Unit '${code}' added to store`);
      }
    } catch {
      // Local fallback
    }

    const newOption: UnitOption = {
      value: code,
      label: `${code} (${code})`,
      category: "Custom",
    };
    setUnits((prev) => [...prev.filter((u) => u.value !== code), newOption]);
    setValue("unit", code);
    setCustomUnitInput("");
    setShowCustomUnit(false);
  }

  async function onSubmit(values: ProductFormValues) {
    const formData = new FormData();
    Object.entries(values as Record<string, unknown>).forEach(([k, v]) => {
      if (v !== undefined && v !== null) formData.append(k, String(v));
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let res: { error?: any } | undefined;

    if (isEdit) {
      const changes: Record<string, unknown> = {}, original: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(values)) {
        if (key === "stock") continue;
        const before = (product as unknown as Record<string, unknown>)[key];
        if (String(before ?? "") !== String(value ?? "")) {
          changes[key] = value;
          original[key] = before ?? "";
        }
      }
      if (!Object.keys(changes).length) {
        toast.error("No changes requested");
        return;
      }
      if (isStaff) {
        const response = await fetch("/api/product-approvals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: product!.id,
            operation: "EDIT",
            reason,
            changes,
            original,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          toast.error(data.error);
          return;
        }
        toast.success("Submitted for admin approval");
        window.location.assign("/approvals");
        return;
      }
      formData.set("changes", JSON.stringify(changes));
      formData.set("original", JSON.stringify(original));
      res = await updateProduct(product!.id, formData);
    } else {
      if (hasPackaging) {
        formData.set("hasPackaging", "true");
        formData.set("packagingName", packName);
        formData.set("packagingConversionQty", packConversionQty);
        formData.set("packagingPrice", packPrice || String(watchedPrice * (parseFloat(packConversionQty) || 1)));
        if (packBarcode.trim()) formData.set("packagingBarcode", packBarcode.trim());
      }
      res = await createProduct(formData);
    }

    if (res?.error) {
      const fieldErrors = res.error.fieldErrors || {};
      const formErrors: string[] = res.error.formErrors || [];

      Object.keys(fieldErrors).forEach((key) => {
        const msgs = fieldErrors[key];
        if (msgs && msgs.length > 0) {
          setError(key as keyof ProductFormValues, { message: msgs[0] });
        }
      });

      if (formErrors.length > 0) {
        toast.error(formErrors.join("\n"));
      } else if (Object.keys(fieldErrors).length > 0) {
        toast.error("Please fix the errors indicated on the form.");
      }
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadLoading(true);
    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Upload failed");
      }
      const data = await res.json();
      setValue("imageUrl", data.url);
      setPreviewUrl(data.url);
      toast.success("Image uploaded");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setUploadLoading(false);
    }
  }

  function field(label: string, name: keyof ProductFormValues, props: React.InputHTMLAttributes<HTMLInputElement> = {}) {
    return (
      <div className="space-y-1">
        <label className="text-sm font-medium">{label}</label>
        <input
          {...registerField(name)}
          {...props}
          className={cn(
            "w-full rounded-md border bg-background px-3 py-2 text-sm",
            errors[name] && "border-destructive focus-visible:ring-destructive",
            props.className
          )}
        />
        {errors[name] && (
          <p className="text-destructive text-xs">{String(errors[name]?.message)}</p>
        )}
      </div>
    );
  }

  // Group units by category
  const categories: Array<UnitOption["category"]> = ["Count", "Length", "Weight", "Volume", "Bulk", "Custom"];

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-5">
      {field("Name *", "name", { placeholder: "e.g. 1-inch Concrete Nails" })}

      <div className="grid grid-cols-2 gap-4">
        {field("SKU", "sku", { placeholder: "NAIL-001" })}
        {field("Barcode", "barcode", { placeholder: "4006381333931" })}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {field("Price *", "price", { type: "number", step: "0.01", min: "0", placeholder: "0.00" })}
        {field("Cost", "cost", { type: "number", step: "0.01", min: "0", placeholder: "0.00" })}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {field("Stock", "stock", { type: "number", min: "0", step: "any", disabled: isEdit })}
        {field("Low Stock Alert", "lowStockThreshold", { type: "number", min: "0", step: "any" })}
      </div>

      {/* Hardware Units Dropdown */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Unit of Measure *</label>
            <button
              type="button"
              onClick={() => setShowCustomUnit(!showCustomUnit)}
              className="text-xs text-primary hover:underline flex items-center gap-0.5"
            >
              <Plus className="h-3 w-3" />
              Add unit
            </button>
          </div>

          {showCustomUnit ? (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. coil, drum"
                value={customUnitInput}
                onChange={(e) => setCustomUnitInput(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={handleAddCustomUnit}
                className="rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                Use
              </button>
              <button
                type="button"
                onClick={() => setShowCustomUnit(false)}
                className="rounded-md border px-2 text-xs"
              >
                ✕
              </button>
            </div>
          ) : (
            <select
              {...registerField("unit")}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {categories.map((cat) => {
                const group = units.filter((u) => u.category === cat);
                if (!group.length) return null;
                return (
                  <optgroup key={cat} label={cat}>
                    {group.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          )}
          {errors.unit && <p className="text-destructive text-xs">{errors.unit.message}</p>}
        </div>

        {field("Quantity Decimals", "quantityPrecision", {
          type: "number",
          min: "0",
          max: "4",
          step: "1",
        })}
      </div>

      {/* Inline Box / Packaging Section (Available when adding new products) */}
      {!isEdit && (
        <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer font-medium text-sm">
              <input
                type="checkbox"
                checked={hasPackaging}
                onChange={(e) => setHasPackaging(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <Package className="h-4 w-4 text-primary" />
              Also sell in Box or Bulk Packaging
            </label>
            {hasPackaging && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calculator className="h-3 w-3" />
                Automatic conversion math enabled
              </span>
            )}
          </div>

          {hasPackaging && (
            <div className="space-y-4 pt-2 border-t">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Packaging Name *
                  </label>
                  <select
                    value={packName}
                    onChange={(e) => setPackName(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                  >
                    <option value="Box">Box</option>
                    <option value="Pack">Pack</option>
                    <option value="Case">Case</option>
                    <option value="Roll">Roll</option>
                    <option value="Bundle">Bundle</option>
                    <option value="Set">Set</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    {watchedUnit.toUpperCase()} per {packName} *
                  </label>
                  <input
                    type="number"
                    min="2"
                    step="1"
                    required
                    value={packConversionQty}
                    onChange={(e) => setPackConversionQty(e.target.value)}
                    placeholder="e.g. 100"
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm font-semibold"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    {packName} Barcode (Optional)
                  </label>
                  <input
                    type="text"
                    value={packBarcode}
                    onChange={(e) => setPackBarcode(e.target.value)}
                    placeholder="Scan box barcode"
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                  />
                </div>
              </div>

              {/* Pricing & Cost Math */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-background/60 p-3 rounded-lg border">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium">Box Cost (Optional)</label>
                    {math.derivedUnitCost !== undefined && (
                      <button
                        type="button"
                        onClick={() => setValue("cost", math.derivedUnitCost)}
                        className="text-[11px] text-primary hover:underline font-medium"
                      >
                        Apply as piece cost (₱{math.derivedUnitCost.toFixed(2)})
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={packCost}
                    onChange={(e) => setPackCost(e.target.value)}
                    placeholder="e.g. 800.00"
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                  />
                  {math.derivedUnitCost !== undefined && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      ₱{packCost} / {packConversionQty} = <strong>₱{math.derivedUnitCost.toFixed(2)}</strong> per {watchedUnit} cost
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium">Box Selling Price *</label>
                    {watchedPrice > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setPackPrice(String(watchedPrice * (parseFloat(packConversionQty) || 1)))
                        }
                        className="text-[11px] text-primary hover:underline font-medium"
                      >
                        Standard (₱{(watchedPrice * (parseFloat(packConversionQty) || 1)).toFixed(2)})
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required={hasPackaging}
                    value={packPrice}
                    onChange={(e) => setPackPrice(e.target.value)}
                    placeholder="e.g. 1000.00"
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm font-semibold"
                  />
                  {math.unitEquivalentPrice !== undefined && (
                    <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5">
                      <span>Equivalent: <strong>₱{math.unitEquivalentPrice.toFixed(2)}</strong>/{watchedUnit}</span>
                      {math.bulkDiscountPercent !== undefined && math.bulkDiscountPercent > 0 && (
                        <span className="text-emerald-600 font-semibold bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded">
                          Save {math.bulkDiscountPercent}% bulk discount
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {field("Category", "category", { placeholder: "Hardware, Electrical, Plumbing" })}

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Tag / Classification</label>
          <div className="flex gap-2">
            {!showCustomTag ? (
              <select
                {...registerField("tag")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setShowCustomTag(true);
                    setValue("tag", "");
                  } else {
                    setValue("tag", e.target.value);
                  }
                }}
              >
                <option value="">None (Standard / General)</option>
                <option value="CHB">CHB (Concrete Hollow Blocks)</option>
                <option value="211">211 (2-1-1 Mix / Aggregates)</option>
                {customTags.filter((t) => t !== "CHB" && t !== "211" && t !== "").map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                <option value="__custom__">+ Custom Tag...</option>
              </select>
            ) : (
              <div className="flex gap-1.5 flex-1">
                <input
                  type="text"
                  placeholder="Enter custom tag..."
                  value={customTagInput}
                  onChange={(e) => setCustomTagInput(e.target.value)}
                  className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = customTagInput.trim().toUpperCase();
                    if (trimmed) {
                      if (!customTags.includes(trimmed)) setCustomTags((prev) => [...prev, trimmed]);
                      setValue("tag", trimmed);
                    }
                    setShowCustomTag(false);
                    setCustomTagInput("");
                  }}
                  className="bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold rounded-md"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomTag(false);
                    setCustomTagInput("");
                  }}
                  className="border px-2.5 py-2 text-xs rounded-md"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">Tag items like CHB or 211 for dedicated classification and filtering.</p>
        </div>
      </div>

      {/* Image upload */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Product Image</label>
        <div className="flex items-center gap-3">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Product preview"
              className="h-16 w-16 rounded-md border object-cover"
            />
          ) : (
            <div className="bg-muted flex h-16 w-16 items-center justify-center rounded-md border">
              <ImageIcon className="text-muted-foreground h-6 w-6" />
            </div>
          )}
          <div className="flex-1 space-y-1">
            <label
              htmlFor="image-upload"
              className={cn(
                "hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                uploadLoading && "pointer-events-none opacity-50"
              )}
            >
              <Upload className="h-4 w-4" />
              {uploadLoading ? "Uploading…" : "Upload image"}
              <input
                id="image-upload"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleImageUpload}
                disabled={uploadLoading}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="checkbox"
            {...registerField("active")}
            className="rounded border-input text-primary focus:ring-primary h-4 w-4"
          />
          <span className="font-medium">Active</span>
          <span className="text-muted-foreground text-xs">(uncheck to archive)</span>
        </label>
      </div>

      {isEdit && <p className="text-sm text-muted-foreground">Use Adjust Stock for stock changes.</p>}
      {isEdit && isStaff && (
        <label className="block text-sm">
          Reason for change *
          <textarea
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="block w-full border rounded p-2"
          />
        </label>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center rounded-md px-6 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {isSubmitting ? "Saving…" : isEdit ? (isStaff ? "Submit for approval" : "Update Product") : "Add Product"}
        </button>
      </div>
    </form>
  );
}
