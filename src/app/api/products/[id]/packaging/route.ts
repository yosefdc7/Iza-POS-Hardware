import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { submitProductChange } from "@/lib/product-approvals";

// GET /api/products/[id]/packaging
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const packagings = await db.productPackaging.findMany({
    where: { productId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(packagings);
}

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}) {
 const session=await auth.api.getSession({headers:await headers()});
 if(!session) return NextResponse.json({error:'Unauthorized'},{status:401});
 if(session.user.role!=='ADMIN') return NextResponse.json({error:'Submit packaging changes for admin approval'},{status:403});
 try {
  const {id}=await params;
  await submitProductChange(session.user,{productId:id,operation:'PACK_ADD',reason:'Administrator packaging addition',changes:await req.json()});
  const created=await db.productPackaging.findFirst({where:{productId:id},orderBy:{createdAt:'desc'}});
  return NextResponse.json(created,{status:201});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to add packaging'},{status:409});}
}
