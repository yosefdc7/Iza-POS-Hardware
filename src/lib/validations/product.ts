import * as z from "zod";

export const productFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  sku: z.string().max(100).optional().or(z.literal("")),
  barcode: z.string().max(100).optional().or(z.literal("")),
  price: z.coerce.number().min(0, "Price must be non-negative"),
  cost: z.coerce.number().min(0).optional(),
  stock: z.coerce.number().min(0).default(0),
  unit: z.string().trim().min(1).max(20).default("pc"),
  quantityPrecision: z.coerce.number().int().min(0).max(4).default(0),
  category: z.string().max(100).optional().or(z.literal("")),
  tag: z.string().trim().max(50).optional().or(z.literal("")),
  lowStockThreshold: z.coerce.number().min(0).default(5),
  imageUrl: z.string().url().optional().or(z.literal("")),
  active: z.preprocess((val) => {
    if (typeof val === "string") return val === "true" || val === "on";
    return val === true;
  }, z.boolean()).default(true),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;

export const packagingFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Packaging name is required").max(100),
  conversionQty: z.coerce
    .number()
    .int("Must be a whole number")
    .min(2, "Must be at least 2 base units per packaging"),
  price: z.coerce.number().min(0, "Price must be non-negative"),
  barcode: z.string().max(100).optional().nullable(),
});

export type PackagingFormValues = z.infer<typeof packagingFormSchema>;
