"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { packagingFormSchema, type PackagingFormValues } from "@/lib/validations/product";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PackagingRow {
  id: string;
  name: string;
  conversionQty: number;
  price: number;
  barcode: string | null;
}

interface PackagingSectionProps {
  productId: string;
  initialPackagings: PackagingRow[];
}

function PackagingRowForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<PackagingFormValues>;
  onSave: (values: PackagingFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PackagingFormValues>({
    resolver: zodResolver(packagingFormSchema) as any,
    defaultValues: initial ?? { price: 0, conversionQty: 2 },
  });

  return (
    <form
      onSubmit={handleSubmit(onSave)}
      className="grid grid-cols-[1fr_80px_100px_120px_auto] gap-2 items-start"
    >
      <div>
        <input
          {...register("name")}
          placeholder="Box of 100"
          className={cn(
            "border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
            errors.name && "border-destructive"
          )}
        />
        {errors.name && <p className="text-destructive text-xs mt-0.5">{errors.name.message}</p>}
      </div>
      <div>
        <input
          {...register("conversionQty")}
          type="number"
          min="2"
          step="1"
          placeholder="100"
          className={cn(
            "border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
            errors.conversionQty && "border-destructive"
          )}
        />
        {errors.conversionQty && (
          <p className="text-destructive text-xs mt-0.5">{errors.conversionQty.message}</p>
        )}
      </div>
      <div>
        <input
          {...register("price")}
          type="number"
          min="0"
          step="0.01"
          placeholder="300.00"
          className={cn(
            "border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
            errors.price && "border-destructive"
          )}
        />
        {errors.price && <p className="text-destructive text-xs mt-0.5">{errors.price.message}</p>}
      </div>
      <div>
        <input
          {...register("barcode")}
          placeholder="Barcode (opt.)"
          className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        />
      </div>
      <div className="flex gap-1 pt-0.5">
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 w-9 items-center justify-center rounded-md disabled:opacity-50"
          title="Save"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="hover:bg-accent inline-flex h-9 w-9 items-center justify-center rounded-md border"
          title="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

export function PackagingSection({ productId, initialPackagings }: PackagingSectionProps) {
  const [packagings, setPackagings] = useState<PackagingRow[]>(initialPackagings);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function requestChange(operation:string, changes:Record<string,unknown>, original:Record<string,unknown>={}) {
    const reason=window.prompt('Reason for packaging change (staff changes require approval):');
    if(!reason?.trim()) return false;
    const res=await fetch('/api/product-approvals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId,operation,reason,changes,original})});
    const data=await res.json();
    if(!res.ok){toast.error(data.error);return false;}
    toast.success(data.request.status==='PENDING'?'Submitted for admin approval':'Packaging updated');
    const current=await fetch(`/api/products/${productId}/packaging`);
    if(current.ok) setPackagings(await current.json());
    return true;
  }
  async function handleAdd(values: PackagingFormValues) {
    if(await requestChange('PACK_ADD',values)) setAdding(false);
  }
  async function handleEdit(id:string,values:PackagingFormValues) {
    const before=packagings.find(p=>p.id===id)!;
    if(await requestChange('PACK_EDIT',{...values,packagingId:id},{name:before.name,price:before.price,conversionQty:before.conversionQty,barcode:before.barcode})) setEditingId(null);
  }
  async function handleDelete(id:string) {
    const before=packagings.find(p=>p.id===id)!;
    await requestChange('PACK_DELETE',{packagingId:id},{name:before.name,price:before.price,conversionQty:before.conversionQty,barcode:before.barcode});
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Packaging Options</h3>
          <p className="text-muted-foreground text-xs">
            Define alternate packaging sizes (e.g. Box of 100). Stock is always tracked in base
            units.
          </p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="hover:bg-accent inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium"
          >
            <Plus className="h-3.5 w-3.5" /> Add Packaging
          </button>
        )}
      </div>

      {packagings.length > 0 && (
        <div className="rounded-md border">
          {/* Header */}
          <div className="grid grid-cols-[1fr_80px_100px_120px_60px] gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
            <span>Name</span>
            <span>Qty</span>
            <span>Price</span>
            <span>Barcode</span>
            <span />
          </div>
          {packagings.map((pkg) => (
            <div key={pkg.id} className="border-b last:border-b-0">
              {editingId === pkg.id ? (
                <div className="px-3 py-2">
                  <PackagingRowForm
                    initial={{
                      id: pkg.id,
                      name: pkg.name,
                      conversionQty: pkg.conversionQty,
                      price: Number(pkg.price),
                      barcode: pkg.barcode ?? undefined,
                    }}
                    onSave={(values) => handleEdit(pkg.id, values)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-[1fr_80px_100px_120px_60px] gap-2 items-center px-3 py-2 text-sm">
                  <span className="font-medium">{pkg.name}</span>
                  <span className="text-muted-foreground">{pkg.conversionQty}×</span>
                  <span>₱{Number(pkg.price).toFixed(2)}</span>
                  <span className="text-muted-foreground truncate">{pkg.barcode ?? "—"}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingId(pkg.id)}
                      className="hover:bg-accent inline-flex h-7 w-7 items-center justify-center rounded"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(pkg.id)}
                      className="hover:bg-destructive/10 text-destructive inline-flex h-7 w-7 items-center justify-center rounded"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="rounded-md border p-3">
          <div className="grid grid-cols-[1fr_80px_100px_120px_auto] gap-1 mb-1 text-xs font-medium text-muted-foreground">
            <span>Name</span>
            <span>Qty</span>
            <span>Price</span>
            <span>Barcode</span>
            <span />
          </div>
          <PackagingRowForm onSave={handleAdd} onCancel={() => setAdding(false)} />
        </div>
      )}

      {packagings.length === 0 && !adding && (
        <p className="text-muted-foreground text-xs italic">
          No packaging options yet. Click &ldquo;Add Packaging&rdquo; to define a Box, Bag, or
          Case.
        </p>
      )}
    </div>
  );
}
