import { headers } from "next/headers";
import { auth } from "@/lib/auth";
export async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role !== "ADMIN") throw new Error("Administrator access required");
  return session;
}
