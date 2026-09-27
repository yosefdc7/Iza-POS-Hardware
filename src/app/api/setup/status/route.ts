import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const hasAdmin = (await prisma.user.count({ where: { role: "ADMIN" } })) > 0;
    return NextResponse.json({ setupComplete: hasAdmin }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
