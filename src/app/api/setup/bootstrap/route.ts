import { NextRequest, NextResponse } from "next/server";
import { bootstrapStore, BootstrapError } from "@/lib/bootstrap";
import { createPosCashierSession } from "@/lib/session-auth";
export async function POST(request: NextRequest) {
  try {
    const user = await bootstrapStore(await request.json().catch(() => null));
    const session = await createPosCashierSession(user.id);
    return NextResponse.json({ ok: true, userId: user.id, token: session.signedToken }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof BootstrapError ? error.message : "Setup could not complete. Try signing in if your account was created." }, { status: error instanceof BootstrapError ? error.status : 503 });
  }
}
