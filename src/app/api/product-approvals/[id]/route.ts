import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff } from '@/lib/require-staff';
import { reviewProductChange } from '@/lib/product-approvals';
import { revalidatePath } from 'next/cache';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}) {
 const session = await requireStaff().catch(()=>null);
 if (!session) return NextResponse.json({error:'Sign in required'},{status:401});
 try {
  const {decision,reason} = z.object({decision:z.enum(['APPROVED','REJECTED','CANCELLED']),reason:z.string().max(1000).optional()}).parse(await req.json());
  if (decision!=='CANCELLED' && session.user.role!=='ADMIN') return NextResponse.json({error:'Administrator approval required'},{status:403});
  const result = await reviewProductChange(session.user,(await params).id,decision,reason);
  revalidatePath('/products');revalidatePath('/approvals');revalidatePath('/pos');
  return NextResponse.json({request:result});
 } catch(error) {
  return NextResponse.json({error:(error as {code?:string}).code==='P2002'?'SKU or barcode is already in use':error instanceof Error?error.message:'Unable to review request'},{status:409});
 }
}
