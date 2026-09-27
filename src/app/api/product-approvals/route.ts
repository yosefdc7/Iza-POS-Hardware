import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/require-staff';
import { submitProductChange } from '@/lib/product-approvals';
import { revalidatePath } from 'next/cache';

export async function POST(req: Request) {
 const session = await requireStaff().catch(()=>null);
 if (!session) return NextResponse.json({error:'Sign in required'},{status:401});
 try {
  const request = await submitProductChange(session.user,await req.json());
  revalidatePath('/products'); revalidatePath('/approvals'); revalidatePath('/pos');
  return NextResponse.json({request},{status:request.status === 'PENDING'?202:200});
 } catch(error) {
  const code = (error as {code?:string}).code;
  return NextResponse.json({error:code==='P2002'?'SKU or barcode is already in use':error instanceof Error?error.message:'Unable to save request'},{status:409});
 }
}
