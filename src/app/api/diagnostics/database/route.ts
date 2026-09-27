import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { runDatabaseDiagnostics } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized: Admin access required" }, { status: 401 });
    }

    const diagnostics = await runDatabaseDiagnostics();
    return NextResponse.json(diagnostics, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    console.error("[Diagnostics API Error - GET]", error);
    return NextResponse.json(
      {
        ok: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized: Admin access required" }, { status: 401 });
    }

    let connectionString: string | undefined;
    try {
      const body = await request.json();
      if (body && typeof body.connectionString === "string" && body.connectionString.trim().length > 0) {
        connectionString = body.connectionString.trim();
      }
    } catch {
      // Empty or non-JSON body is valid — simply runs default active diagnostic
    }

    const diagnostics = await runDatabaseDiagnostics(
      connectionString ? { customConnectionString: connectionString } : undefined
    );

    return NextResponse.json(diagnostics, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    console.error("[Diagnostics API Error - POST]", error);
    return NextResponse.json(
      {
        ok: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
