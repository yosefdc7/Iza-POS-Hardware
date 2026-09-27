"use client";

import { useEffect, useState, useCallback } from "react";
import type { AuthUser, Session, SessionResult } from "./auth";
import { activateBrowserSession } from "./browser-session";

export interface SignInEmailParams {
  email: string;
  password: string;
}

export interface SignInResult {
  data: { user: AuthUser; session: Session; token?: string } | null;
  error: { message: string; code?: string; status?: number } | null;
}

export function getStoredSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const qToken = urlParams.get("session_token") || urlParams.get("token");
    if (qToken) {
      localStorage.setItem("izah_session_token", qToken);
      return qToken;
    }
    return localStorage.getItem("izah_session_token");
  } catch {
    return null;
  }
}

export const signIn = {
  async email(params: SignInEmailParams): Promise<SignInResult> {
    try {
      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || json.error) {
        return {
          data: null,
          error: {
            message: json?.error?.message || "Invalid email or password",
            code: json?.error?.code || "INVALID_CREDENTIALS",
            status: res.status,
          },
        };
      }

      if (typeof window !== "undefined" && json.token) {
        await activateBrowserSession(json.token, json.user.id);
        try {
          localStorage.setItem("izah_session_token", json.token);
          document.cookie = `izah_session_token=${json.token}; Path=/; Max-Age=604800; SameSite=None; Secure`;
          document.cookie = `better-auth.session_token=${json.token}; Path=/; Max-Age=604800; SameSite=None; Secure`;
        } catch {}
      }

      return {
        data: {
          user: json.user,
          session: json.session,
          token: json.token,
        },
        error: null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to sign in. Please try again.";
      return {
        data: null,
        error: {
          message,
          status: 500,
        },
      };
    }
  },
};

export async function signOut(): Promise<void> {
  try {
    if (typeof window !== "undefined") {
      if ("caches" in window) {
        await Promise.all((await caches.keys()).filter(name => name.startsWith("izah-pos-")).map(name => caches.delete(name)));
      }
      try {
        localStorage.removeItem("izah_session_token");
        localStorage.removeItem("izah_user_id");
        document.cookie = "izah_session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure";
        document.cookie = "better-auth.session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure";
      } catch {}
    }
    await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Sign out error", err);
  }
}

export async function getSession(): Promise<{ data: SessionResult | null; error: Error | null }> {
  try {
    const token = getStoredSessionToken();
    const reqHeaders: Record<string, string> = {};
    if (token) {
      reqHeaders["x-session-token"] = token;
      reqHeaders["izah-session-token"] = token;
      reqHeaders["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch("/api/auth/get-session", {
      cache: "no-store",
      headers: reqHeaders,
      credentials: "include",
    });
    if (!res.ok) return { data: null, error: new Error(`Status ${res.status}`) };
    const data = await res.json();
    return { data: data || null, error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err : new Error("Failed to get session") };
  }
}

export function useSession() {
  const [data, setData] = useState<SessionResult | null>(null);
  const [isPending, setIsPending] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      const token = getStoredSessionToken();
      const reqHeaders: Record<string, string> = {};
      if (token) {
        reqHeaders["x-session-token"] = token;
        reqHeaders["izah-session-token"] = token;
        reqHeaders["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch("/api/auth/get-session", {
        cache: "no-store",
        headers: reqHeaders,
        credentials: "include",
      });
      if (res.ok) {
        const json = await res.json();
        setData(json || null);
      } else {
        setData(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error("Failed to fetch session"));
      setData(null);
    } finally {
      setIsPending(false);
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  return {
    data,
    isPending,
    error,
    refetch: fetchSession,
  };
}

export const authClient = {
  signIn,
  signOut,
  getSession,
  useSession,
};
