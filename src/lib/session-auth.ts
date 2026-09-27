import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { signToken } from "@/lib/auth";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

/**
 * Creates a valid session for the given user ID,
 * signs the session token, and attaches the session cookies to the response.
 */
export async function createPosCashierSession(userId: string): Promise<{ token: string; signedToken: string }> {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  const session = await prisma.session.create({
    data: {
      token: rawToken,
      userId,
      expiresAt,
    },
  });

  const signedToken = signToken(session.token);

  const cookieStore = await cookies();
  // In Cloud Run / AI Studio preview iframe, cookies MUST be SameSite=None and Secure
  // so browsers do not reject them in cross-site iframe contexts.
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  };

  cookieStore.set("izah_session_token", signedToken, cookieOptions);
  cookieStore.set("better-auth.session_token", signedToken, cookieOptions);
  if (process.env.NODE_ENV === "production") cookieStore.set("__Secure-better-auth.session_token", signedToken, cookieOptions);
  cookieStore.set("izah-setup-complete", "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 31536000,
    path: "/",
  });

  return { token: session.token, signedToken };
}
