"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { requireStaff } from "@/lib/require-staff";
import { submitProductChange } from "@/lib/product-approvals";
import { quantityFitsPrecision } from "@/lib/daily-ledger";
import { prisma } from "@/lib/db";
import { productFormSchema } from "@/lib/validations/product";

/** Check if a P2002 error relates to a given field name */
function isConstraintOn(e: any, field: string): boolean {
  // Prisma 7 with adapter uses meta.constraint (the raw PG constraint name)
  // Older versions use meta.target (array of field names)
  const constraint: string = e.meta?.constraint ?? "";
  const target: unknown = e.meta?.target;
  const fieldLower = field.toLowerCase();

  if (constraint && constraint.toLowerCase().includes(fieldLower)) return true;
  if (Array.isArray(target)) return target.some((t: string) => t.toLowerCase().includes(fieldLower));
  if (typeof target === "string") return target.toLowerCase().includes(fieldLower);
  return false;
}

export async function createProduct(formData: FormData) {
  await requireStaff();
  const raw = Object.fromEntries(formData.entries());
  const parsed = productFormSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.flatten() };
  }

  if (!quantityFitsPrecision(parsed.data.stock, parsed.data.quantityPrecision)) return {error:{formErrors:["Stock does not fit quantity decimals"],fieldErrors:{}}};
  const data = {
    ...parsed.data,
    sku: parsed.data.sku || null,
    barcode: parsed.data.barcode || null,
    category: parsed.data.category || null,
    imageUrl: parsed.data.imageUrl || null,
  };

  const hasPackaging = raw.hasPackaging === "true" || raw.hasPackaging === "1";
  const packagingName = String(raw.packagingName || "Box").trim();
  const packagingConversionQty = parseFloat(String(raw.packagingConversionQty || "0"));
  const packagingPrice = parseFloat(String(raw.packagingPrice || "0"));
  const packagingBarcode = String(raw.packagingBarcode || "").trim() || null;

  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({ data });
      if (hasPackaging && packagingConversionQty >= 2 && !isNaN(packagingPrice) && packagingPrice >= 0) {
        await tx.productPackaging.create({
          data: {
            productId: created.id,
            name: packagingName,
            conversionQty: packagingConversionQty,
            price: packagingPrice,
            barcode: packagingBarcode,
          },
        });
      }
      return created;
    });
  } catch (e: any) {
    console.error("createProduct error:", e.code, JSON.stringify(e.meta));
    if (e.code === "P2002") {
      if (isConstraintOn(e, "sku")) {
        return { error: { formErrors: [], fieldErrors: { sku: ["A product with this SKU already exists"] } } };
      }
      if (isConstraintOn(e, "barcode")) {
        return { error: { formErrors: [], fieldErrors: { barcode: ["A product with this Barcode already exists"] } } };
      }
      return { error: { formErrors: ["A duplicate value was found. Please check SKU or barcode."], fieldErrors: {} } };
    }
    return { error: { formErrors: ["An unexpected error occurred. Please try again."], fieldErrors: {} } };
  }

  revalidatePath("/products");
  redirect("/products");
}

export async function updateProduct(id: string, formData: FormData) {
 const {user}=await requireAdmin();
 try {
  const changes=JSON.parse(String(formData.get('changes')));
  const original=JSON.parse(String(formData.get('original')));
  await submitProductChange(user,{productId:id,operation:'EDIT',reason:'Administrator edit',changes,original});
 } catch(error) {return {error:{fieldErrors:{},formErrors:[error instanceof Error?error.message:'Unable to update product']}};}
 revalidatePath('/products');redirect('/products');
}
export async function deleteProduct(id: string) {
 const {user}=await requireAdmin();
 await submitProductChange(user,{productId:id,operation:'ARCHIVE',reason:'Administrator archive'});
 revalidatePath('/products');
}
