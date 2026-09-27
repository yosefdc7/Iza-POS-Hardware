import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { submitProductChange } from "@/lib/product-approvals";

const adjustSchema = z
  .object({
    productId: z.string(),
    delta: z.number().finite().optional(),
    quantity: z.number().finite().optional(),
    reason: z.enum(["RECEIVED", "DAMAGED", "THEFT", "CORRECTION", "OPENING_COUNT"]),
    note: z.string().optional(),
  })
  .refine(
    (data) => {
      const d = data.delta ?? data.quantity;
      return typeof d === "number" && d !== 0;
    },
    { message: "Adjustment delta cannot be zero", path: ["delta"] }
  );

export async function POST(req: NextRequest) {
 const session=await auth.api.getSession({headers:await headers()});
 if(!session) return NextResponse.json({error:'Sign in required'},{status:401});
 try {
  const parsed=adjustSchema.parse(await req.json());
  const request=await submitProductChange(session.user,{productId:parsed.productId,operation:'STOCK',reason:parsed.note?.trim() || parsed.reason,changes:{delta:parsed.delta ?? parsed.quantity,stockReason:parsed.reason}});
  return NextResponse.json({request,pending:request.status==='PENDING',lowStockAlerts:[]},{status:request.status==='PENDING'?202:200});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to adjust stock'},{status:409});}
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const productId = req.nextUrl.searchParams.get("productId");

  const adjustments = await prisma.stockAdjustment.findMany({
    where: productId ? { productId } : undefined,
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ adjustments });
}
