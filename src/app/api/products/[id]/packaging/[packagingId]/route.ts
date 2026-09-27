import {NextResponse} from 'next/server';
import {headers} from 'next/headers';
import {auth} from '@/lib/auth';
import {prisma} from '@/lib/db';
import {submitProductChange} from '@/lib/product-approvals';
type Context={params:Promise<{id:string;packagingId:string}>};
async function change(req:Request,context:Context,operation:'PACK_EDIT'|'PACK_DELETE') {
 const session=await auth.api.getSession({headers:await headers()});
 if(!session) return NextResponse.json({error:'Unauthorized'},{status:401});
 if(session.user.role!=='ADMIN') return NextResponse.json({error:'Submit packaging changes for admin approval'},{status:403});
 try {
  const {id,packagingId}=await context.params;
  const changes=operation==='PACK_EDIT'?await req.json():{};
  await submitProductChange(session.user,{productId:id,operation,reason:'Administrator packaging change',changes:{...changes,packagingId}});
  return NextResponse.json(operation==='PACK_DELETE'?{success:true}:await prisma.productPackaging.findUnique({where:{id:packagingId}}));
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to change packaging'},{status:409});}
}
export const PUT=(req:Request,context:Context)=>change(req,context,'PACK_EDIT');
export const DELETE=(req:Request,context:Context)=>change(req,context,'PACK_DELETE');
