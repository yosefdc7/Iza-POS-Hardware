import { z } from 'zod';
import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { productFormSchema, packagingFormSchema } from '@/lib/validations/product';
import { quantityFitsPrecision } from '@/lib/daily-ledger';

type Actor = { id: string; role?: string; name?: string };
type Tx = Prisma.TransactionClient;
const editSchema = productFormSchema.omit({ stock: true }).partial().strict();
const inputSchema = z.object({
 productId: z.string().min(1),
 operation: z.enum(['EDIT','ARCHIVE','STOCK','PACK_ADD','PACK_EDIT','PACK_DELETE']),
 reason: z.string().trim().min(1, 'A reason is required').max(1000),
 changes: z.record(z.string(), z.unknown()).default({}),
 original: z.record(z.string(), z.unknown()).default({}),
});
function parseEdit(raw: Record<string, unknown>) {
 const parsed=editSchema.parse(raw);
 return Object.fromEntries(Object.entries(parsed).filter(([key])=>key in raw)) as typeof parsed;
}
const stockSchema = z.object({delta:z.number().finite().refine(v=>v!==0),stockReason:z.enum(['RECEIVED','DAMAGED','THEFT','CORRECTION','OPENING_COUNT'])}).strict();
const json = (value: unknown): Prisma.InputJsonObject => JSON.parse(JSON.stringify(value));
const comparable = (value: unknown) => value == null ? '' : String(value);
function assertActor(actor: Actor) {
 if (!actor.id || !['ADMIN','CASHIER'].includes(actor.role || '')) throw new Error('Sign in required');
}
async function lockProduct(tx: Tx, id: string) {
 await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${id} FOR UPDATE`;
 const product = await tx.product.findUnique({where:{id}});
 if (!product) throw new Error('Product not found');
 return product;
}
function assertOriginal(current: Record<string, unknown>, original: Record<string, unknown>) {
 for (const [key,value] of Object.entries(original)) {
  if (comparable(current[key]) !== comparable(value)) throw new Error('This item changed. Cancel this request and submit it again using the current values.');
 }
}

export async function submitProductChange(actor: Actor, raw: unknown) {
 assertActor(actor);
 const input = inputSchema.parse(raw);
 return prisma.$transaction(async tx => {
  const product = await lockProduct(tx,input.productId);
  if (!product.active && !(input.operation === 'EDIT' && input.changes.active === true)) throw new Error('Archived items can only be changed with an explicit reactivation');
  let changes: Record<string, unknown> = {}, original: Record<string, unknown> = {};
  if (input.operation === 'EDIT') {
   changes = parseEdit(input.changes);
   if (!Object.keys(changes).length) throw new Error('No changes requested');
   for (const key of Object.keys(changes)) {
    if (!(key in input.original)) throw new Error('Original values are required');
    original[key] = input.original[key];
   }
   assertOriginal(product,original);
  } else if (input.operation === 'STOCK') {
   changes = stockSchema.parse(input.changes);
   original = {stock:String(product.stock),quantityPrecision:product.quantityPrecision};
  } else if (input.operation.startsWith('PACK_')) {
   if (input.operation !== 'PACK_ADD') {
    const packagingId = z.string().min(1).parse(input.changes.packagingId);
    const pack = await tx.productPackaging.findFirst({where:{id:packagingId,productId:product.id}});
    if (!pack) throw new Error('Packaging not found');
    original = { name:pack.name,price:String(pack.price),conversionQty:String(pack.conversionQty),barcode:pack.barcode };
    if (actor.role !== 'ADMIN') assertOriginal(original,input.original);
    changes.packagingId = packagingId;
   }
   if (input.operation !== 'PACK_DELETE') {
    const {name,price,conversionQty,barcode} = packagingFormSchema.parse(input.changes);
    changes = {...changes,name,price,conversionQty,barcode:barcode || null};
   }
  } else {
   original = {name:product.name,active:product.active,updatedAt:product.updatedAt?.toISOString()};
  }
  const request = await tx.productChangeRequest.create({data:{productId:product.id,requesterId:actor.id,requesterName:actor.name || actor.id,operation:input.operation,reason:input.reason,changes:json(changes),original:json(original),status:'PENDING'}});
  if (actor.role === 'ADMIN') return applyRequest(tx,request,actor);
  return request;
 }, {timeout:15000});
}

async function applyRequest(tx: Tx, request: Awaited<ReturnType<Tx['productChangeRequest']['create']>>, actor: Actor) {
 const product = await lockProduct(tx,request.productId);
 if (!product.active && !(request.operation === 'EDIT' && (request.changes as Record<string,unknown>).active === true)) throw new Error('Archived items can only be changed with an explicit reactivation');
 const changes = request.changes as Record<string, unknown>;
 const original = request.original as Record<string, unknown>;
 if (request.operation === 'EDIT') {
  assertOriginal(product,original);
  const data = parseEdit(changes);
  if (data.quantityPrecision !== undefined && !quantityFitsPrecision(Number(product.stock),data.quantityPrecision)) throw new Error('Current stock does not fit the requested quantity precision');
  await tx.product.update({where:{id:product.id},data:{...data,...('sku' in data ? {sku:data.sku || null}:{}),...('barcode' in data ? {barcode:data.barcode || null}:{}),...('imageUrl' in data ? {imageUrl:data.imageUrl || null}:{})}});
 } else if (request.operation === 'ARCHIVE') {
  // Sales update updatedAt too: compare catalog fields, not the sale-driven timestamp.
  assertOriginal(product,{name:original.name,active:original.active});
  await tx.product.update({where:{id:product.id},data:{active:false}});
 } else if (request.operation === 'STOCK') {
  const {delta,stockReason} = stockSchema.parse(changes);
  if (Number(product.stock)+delta<0 || !quantityFitsPrecision(Math.abs(delta),product.quantityPrecision)) throw new Error('Invalid stock adjustment: check available stock and decimal precision');
  await tx.product.update({where:{id:product.id},data:{stock:{increment:delta}}});
  await tx.stockAdjustment.create({data:{productId:product.id,userId:actor.id,delta,reason:stockReason,note:`${request.reason} (requested by ${request.requesterName}; approval ${request.id})`}});
 } else {
  const packagingId = changes.packagingId as string;
  if (request.operation !== 'PACK_ADD') {
   const pack = await tx.productPackaging.findFirst({where:{id:packagingId,productId:product.id}});
   if (!pack) throw new Error('Packaging not found');
   assertOriginal(pack,original);
  }
  if (request.operation === 'PACK_DELETE') {
   if (await tx.saleItem.count({where:{packagingId}})) throw new Error('Packaging used on receipts cannot be deleted; its history must be retained');
   await tx.productPackaging.delete({where:{id:packagingId}});
  } else {
   const {name,price,conversionQty,barcode} = packagingFormSchema.parse(changes);
   const data = {name,price,conversionQty,barcode:barcode || null};
   if (request.operation === 'PACK_ADD') await tx.productPackaging.create({data:{...data,productId:product.id}});
   else await tx.productPackaging.update({where:{id:packagingId},data});
  }
 }
 return tx.productChangeRequest.update({where:{id:request.id},data:{status:'APPROVED',reviewerId:actor.id,reviewerName:actor.name || actor.id,reviewedAt:new Date()}});
}

export async function reviewProductChange(actor: Actor, id: string, decision: 'APPROVED'|'REJECTED'|'CANCELLED', reason?: string) {
 assertActor(actor);
 if (decision !== 'CANCELLED' && actor.role !== 'ADMIN') throw new Error('Administrator approval required');
 if (decision === 'REJECTED' && !reason?.trim()) throw new Error('A rejection reason is required');
 return prisma.$transaction(async tx => {
  await tx.$queryRaw`SELECT id FROM "ProductChangeRequest" WHERE id = ${id} FOR UPDATE`;
  const request = await tx.productChangeRequest.findUnique({where:{id}});
  if (!request || request.status !== 'PENDING') throw new Error('Request is no longer pending');
  if (decision === 'CANCELLED' && request.requesterId !== actor.id) throw new Error('Only the requester can cancel');
  if (decision === 'APPROVED') return applyRequest(tx,request,actor);
  return tx.productChangeRequest.update({where:{id},data:{status:decision,reviewerId:actor.id,reviewerName:actor.name || actor.id,reviewReason:reason?.trim().slice(0,1000),reviewedAt:new Date()}});
 },{timeout:15000});
}
