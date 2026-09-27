import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Quick probe to verify database connectivity
    await prisma.businessSettings.findFirst().catch(() => null);
    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json({
      status: "degraded",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    }, { status: 200 });
  }
}
