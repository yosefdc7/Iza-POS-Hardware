import { NextRequest, NextResponse } from "next/server";
import { auth, signToken } from "@/lib/auth";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function setAuthCookies(res: NextResponse, signedToken: string) {
  const isSecure = process.env.NODE_ENV === "production";
  const cookieOptions = {
    httpOnly: true,
    secure: isSecure,
    sameSite: (isSecure ? "none" : "lax") as "none" | "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  };

  res.cookies.set("izah_session_token", signedToken, cookieOptions);
  res.cookies.set("better-auth.session_token", signedToken, cookieOptions);
  res.cookies.set("izah-setup-complete", "1", {
    httpOnly: true,
    secure: isSecure,
    sameSite: (isSecure ? "none" : "lax") as "none" | "lax",
    maxAge: 31536000,
    path: "/",
  });

  if (isSecure) {
    res.cookies.set("__Secure-better-auth.session_token", signedToken, {
      ...cookieOptions,
      secure: true,
      sameSite: "none",
    });
  }
}

function clearAuthCookies(res: NextResponse) {
  const isSecure = process.env.NODE_ENV === "production";
  const clearOptions = {
    httpOnly: true,
    secure: isSecure,
    sameSite: (isSecure ? "none" : "lax") as "none" | "lax",
    maxAge: 0,
    path: "/",
  };
  res.cookies.set("izah_session_token", "", clearOptions);
  res.cookies.set("better-auth.session_token", "", clearOptions);
  res.cookies.set("__Secure-better-auth.session_token", "", {
    ...clearOptions,
    secure: true,
    sameSite: "none",
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ all: string[] }> }) {
  const { all } = await context.params;
  const action = (all || []).join("/");

  if (action === "sign-in/email" || action === "signin/email" || action === "sign-in") {
    try {
      const body = await request.json();
      const result = await auth.api.signInEmail({ body });
      const response = NextResponse.json({
        user: result.user,
        session: result.session,
        token: result.token,
      });
      setAuthCookies(response, result.token);
      return response;
    } catch (err: any) {
      return NextResponse.json(
        { error: { message: err?.message || "Invalid credentials", status: 401 } },
        { status: 401 }
      );
    }
  }

  if (action === "sign-up/email" || action === "signup/email" || action === "sign-up") {
    return NextResponse.json({ error: "Public sign-up is disabled" }, { status: 403 });
  }

  if (action === "sign-out" || action === "signout") {
    await auth.api.signOut({ headers: request.headers });
    const response = NextResponse.json({ success: true });
    clearAuthCookies(response);
    return response;
  }

  return NextResponse.json({ error: "Unknown auth endpoint" }, { status: 404 });
}

export async function GET(request: NextRequest, context: { params: Promise<{ all: string[] }> }) {
  const { all } = await context.params;
  const action = (all || []).join("/");

  if (action === "get-session" || action === "session") {
    const session = await auth.api.getSession({ headers: request.headers });
    return NextResponse.json(session);
  }

  return NextResponse.json({ error: "Unknown auth endpoint" }, { status: 404 });
}
