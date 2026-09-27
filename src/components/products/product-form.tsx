"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { productFormSchema, type ProductFormValues } from "@/lib/validations/product";
import { createProduct, updateProduct } from "@/app/actions/product-actions";
import { cn } from "@/lib/utils";
import { Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

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
  const [reason,setReason]=useState("");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(product?.imageUrl ?? null);

  const {
    register: registerField,
    handleSubmit,
    setValue,
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
          lowStockThreshold: parseFloat(String(product.lowStockThreshold)),
          imageUrl: product.imageUrl ?? "",
          active: product.active,
        }
      : { stock: 0, unit: "pc", quantityPrecision: 0, lowStockThreshold: 5, active: true },
  });

  async function onSubmit(values: ProductFormValues) {
    const formData = new FormData();
    Object.entries(values as Record<string, unknown>).forEach(([k, v]) => {
      if (v !== undefined && v !== null) formData.append(k, String(v));
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let res: { error?: any } | undefined;

    if (isEdit) {
      const changes: Record<string,unknown>={},original: Record<string,unknown>={};
      for(const [key,value] of Object.entries(values)) {
        if(key==='stock') continue;
        const before=(product as unknown as Record<string,unknown>)[key];
        if(String(before ?? '')!==String(value ?? '')) {changes[key]=value;original[key]=before ?? '';}
      }
      if(!Object.keys(changes).length) {toast.error('No changes requested');return;}
      if(isStaff) {
        const response=await fetch('/api/product-approvals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:product!.id,operation:'EDIT',reason,changes,original})});
        const data=await response.json();
        if(!response.ok){toast.error(data.error);return;}
        toast.success('Submitted for admin approval');window.location.assign('/approvals');return;
      }
      formData.set('changes',JSON.stringify(changes));formData.set('original',JSON.stringify(original));
      res = await updateProduct(product!.id, formData);
    } else {
      res = await createProduct(formData);
    }

    if (res?.error) {
      const fieldErrors = res.error.fieldErrors || {};
      const formErrors: string[] = res.error.formErrors || [];

      // Set field-level errors (shows red border + message under the field)
      Object.keys(fieldErrors).forEach((key) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setError(key as any, { type: "server", message: fieldErrors[key][0] });
        toast.error(fieldErrors[key][0]); // also pop a toast for visibility
      });

      // Form-level errors (not tied to a specific field)
      if (Object.keys(fieldErrors).length === 0) {
        toast.error(formErrors[0] ?? "Failed to save product. Please try again.");
      }
      return;
    }

    toast.success(isEdit ? "Product updated successfully" : "Product created successfully");
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (res.ok) {
        const { url } = await res.json();
        setValue("imageUrl", url);
        setPreviewUrl(url);
      }
    } finally {
      setUploadLoading(false);
    }
  }

  function field(
    label: string,
    name: keyof ProductFormValues,
    props?: React.InputHTMLAttributes<HTMLInputElement>
  ) {
    return (
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{label}</label>
        <input
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...registerField(name as any)}
          {...props}
          className={cn(
            "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
      {field("Name *", "name", { placeholder: "e.g. Espresso Coffee" })}

      <div className="grid grid-cols-2 gap-4">
        {field("SKU", "sku", { placeholder: "CAFE-001" })}
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

      <div className="grid grid-cols-2 gap-4">
        {field("Unit", "unit", { placeholder: "pc, kg, bag, cubic" })}
        {field("Quantity Decimals", "quantityPrecision", {
          type: "number",
          min: "0",
          max: "4",
          step: "1",
        })}
      </div>

      {field("Category", "category", { placeholder: "Beverages" })}

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
              />
            </label>
            <p className="text-muted-foreground text-xs">JPEG, PNG, WebP up to 5 MB</p>
          </div>
        </div>
        {/* Hidden field for imageUrl */}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <input type="hidden" {...registerField("imageUrl" as any)} />
      </div>

      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <input
          type="checkbox"
          id="active"
          {...registerField("active" as any)}
          className="h-4 w-4"
        />
        <label htmlFor="active" className="text-sm font-medium">
          Active (visible in POS)
        </label>
      </div>

      {isEdit && <p className="text-sm text-muted-foreground">Use Adjust Stock for stock changes.</p>}
      {isEdit && isStaff && <label className="block text-sm">Reason for change *<textarea required maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} className="block w-full border rounded p-2" /></label>}
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
