import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPin, isValidPinFormat } from "@/lib/pin-auth";
import { createPosCashierSession } from "@/lib/session-auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { pin, userId } = body;

    if (!pin || typeof pin !== "string" || !isValidPinFormat(pin)) {
      return NextResponse.json({ error: "PIN must be exactly 4 digits" }, { status: 400 });
    }

    let matchedUser = null;

    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, role: true, pin: true },
      });
      if (user && user.pin && verifyPin(pin, user.pin)) {
        matchedUser = user;
      }
    }

    // Fallback: If no match for selected user or no userId provided, check all users
    if (!matchedUser && !userId) {
      const users = await prisma.user.findMany({
        where: { pin: { not: null } },
        select: { id: true, name: true, email: true, role: true, pin: true },
      });

      for (const user of users) {
        if (user.pin && verifyPin(pin, user.pin)) {
          matchedUser = user;
          break;
        }
      }
    }

    if (!matchedUser) {
      return NextResponse.json({ error: "Incorrect PIN. Please try again." }, { status: 401 });
    }

    const { signedToken } = await createPosCashierSession(matchedUser.id);

    const response = NextResponse.json({
      success: true,
      token: signedToken,
      user: {
        id: matchedUser.id,
        name: matchedUser.name,
        email: matchedUser.email,
        role: matchedUser.role,
      },
      redirectTo: `/pos?session_token=${encodeURIComponent(signedToken)}`,
    });

    const isSecure = process.env.NODE_ENV === "production";
    const cookieOptions = {
      httpOnly: true,
      secure: isSecure,
      sameSite: (isSecure ? "none" : "lax") as "none" | "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    };
    response.cookies.set("izah_session_token", signedToken, cookieOptions);
    response.cookies.set("better-auth.session_token", signedToken, cookieOptions);
    if (isSecure) {
      response.cookies.set("__Secure-better-auth.session_token", signedToken, {
        ...cookieOptions,
        secure: true,
        sameSite: "none",
      });
    }

    return response;
  } catch (err) {
    console.error("PIN login API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal authentication error" },
      { status: 500 }
    );
  }
}
