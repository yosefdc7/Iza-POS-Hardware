import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        pin: true,
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        name: u.name || u.email,
        email: u.email,
        role: u.role,
        hasPin: Boolean(u.pin),
      })),
    });
  } catch (err: any) {
    console.error("Failed to load staff list API:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load staff list", users: [] },
      { status: 500 }
    );
  }
}
