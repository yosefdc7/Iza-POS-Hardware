import {Prisma} from '@/generated/prisma/client';
export async function lockCheckoutProducts(tx:Prisma.TransactionClient,ids:string[]) {
 const sorted=[...new Set(ids)].sort();
 if(!sorted.length) return [];
 // Same row locks as approval writes; always acquire in a stable order.
 await tx.$queryRaw(Prisma.sql`SELECT id FROM "Product" WHERE id IN (${Prisma.join(sorted)}) ORDER BY id FOR UPDATE`);
 return tx.product.findMany({where:{id:{in:sorted}},include:{packagings:true}});
}
export function validateCheckoutStock(products:Array<{id:string;name:string;stock:unknown}>,items:Array<{productId:string;stockDeduction:number}>) {
 const totals=new Map<string,number>();
 for(const item of items) totals.set(item.productId,(totals.get(item.productId)||0)+item.stockDeduction);
 for(const product of products) {
  if((totals.get(product.id)||0)>Number(product.stock)+1e-7) throw new Error(`Insufficient stock for ${product.name}`);
 }
}
