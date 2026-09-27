import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Middleware runs in Edge runtime.
// Auth cookie presence is checked; full session validation happen in Server Components.

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/ping"];

function isOriginAllowed(origin: string | null, request: NextRequest): boolean {
  if (!origin) return true; // Direct same-origin or non-browser request

  // Check request's own origin
  if (request.nextUrl.origin && request.nextUrl.origin === origin) {
    return true;
  }

  if (process.env.NODE_ENV === "production") {
    return (process.env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).includes(origin);
  }

  // Check against forwarded headers from reverse proxy (Cloud Run nginx)
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (forwardedHost) {
    const rawHost = forwardedHost.split(":")[0];
    try {
      const originUrl = new URL(origin);
      if (originUrl.hostname === rawHost || originUrl.host === forwardedHost) {
        return true;
      }
    } catch {
      // ignore parsing failure
    }
  }

  // Check configured origins
  const envOrigins = process.env.ALLOWED_ORIGINS;
  if (envOrigins) {
    const list = envOrigins.split(",").map((o) => o.trim()).filter(Boolean);
    if (list.includes(origin)) return true;
  }

  try {
    const originUrl = new URL(origin);
    const hostname = originUrl.hostname.toLowerCase();

    // Permit Cloud Run domains, AI Studio environments, and local development
    if (
      hostname === "ai.studio" ||
      hostname.endsWith(".ai.studio") ||
      hostname.endsWith(".run.app") ||
      hostname.endsWith(".google.com") ||
      hostname.endsWith(".googleusercontent.com") ||
      hostname.endsWith(".web.app") ||
      hostname.endsWith(".firebaseapp.com") ||
      hostname === "localhost" ||
      hostname === "127.0.0.1"
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function applyCorsHeaders(response: NextResponse, origin: string | null, isAllowed: boolean): NextResponse {
  if (origin && isAllowed) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Vary", "Origin");
  }
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get("origin");
  const isAllowedOrigin = isOriginAllowed(origin, request);

  // Handle CORS preflight (OPTIONS)
  if (request.method === "OPTIONS") {
    if (origin && !isAllowedOrigin) {
      return new NextResponse("Forbidden: Invalid Origin", { status: 403 });
    }
    const preflightHeaders = new Headers({
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, izah-session-token",
      "Access-Control-Max-Age": "86400",
    });
    if (origin && isAllowedOrigin) {
      preflightHeaders.set("Access-Control-Allow-Origin", origin);
      preflightHeaders.set("Access-Control-Allow-Credentials", "true");
      preflightHeaders.set("Vary", "Origin");
    }
    return new NextResponse(null, { status: 204, headers: preflightHeaders });
  }

  // Reject cross-origin mutation requests (POST, PUT, PATCH, DELETE) with unlisted Origin
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
  if (origin && isMutation && !isAllowedOrigin) {
    return new NextResponse("Forbidden: Invalid Origin", { status: 403 });
  }

  // Allow Next.js internals & static assets (including all public/ files)
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/sw.js") ||
    pathname.startsWith("/uploads") ||
    /\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|eot|webmanifest)$/i.test(pathname)
  ) {
    return applyCorsHeaders(NextResponse.next(), origin, isAllowedOrigin);
  }

  // Check auth via session cookie, query parameter, or custom headers
  // (essential for cross-site iframes where 3rd-party cookies may be partitioned or blocked)
  const tokenFromQuery =
    request.nextUrl.searchParams.get("session_token") ||
    request.nextUrl.searchParams.get("token");

  const cookieToken =
    request.cookies.get("izah_session_token")?.value ||
    request.cookies.get("better-auth.session_token")?.value ||
    request.cookies.get("__Secure-better-auth.session_token")?.value;

  const authHeader = request.headers.get("authorization") || "";
  const headerToken =
    request.headers.get("x-session-token") ||
    request.headers.get("izah-session-token") ||
    (authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null);

  const activeToken = tokenFromQuery || headerToken || cookieToken;
  const hasSession = !!activeToken;

  if (pathname === "/setup" || pathname.startsWith("/api/setup/")) {
    return applyCorsHeaders(NextResponse.next(), origin, isAllowedOrigin);
  }

  // All API routes must proceed to route handlers rather than being redirected to /login with HTML
  if (pathname.startsWith("/api/")) {
    const requestHeaders = new Headers(request.headers);
    if (activeToken) {
      const existingCookie = requestHeaders.get("cookie") || "";
      if (!existingCookie.includes("izah_session_token")) {
        requestHeaders.set(
          "cookie",
          `${existingCookie ? existingCookie + "; " : ""}izah_session_token=${activeToken}; better-auth.session_token=${activeToken}`
        );
      }
      requestHeaders.set("x-session-token", activeToken);
      requestHeaders.set("authorization", `Bearer ${activeToken}`);
    }
    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    return applyCorsHeaders(response, origin, isAllowedOrigin);
  }

  // If already authenticated and trying to access /login, redirect straight to /pos
  if (hasSession && pathname === "/login" && !request.nextUrl.searchParams.has("force") && !request.nextUrl.searchParams.has("logout")) {
    const dest = activeToken ? `/pos?session_token=${encodeURIComponent(activeToken)}` : "/pos";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // Allow public paths (e.g. /login, /api/ping)
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return applyCorsHeaders(NextResponse.next(), origin, isAllowedOrigin);
  }

  // If not authenticated and trying to access protected route, redirect to /login
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    if (pathname && pathname !== "/" && pathname !== "/pos") {
      loginUrl.searchParams.set("redirect", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Prepare response. Forward active token in request headers and set cookies
  const requestHeaders = new Headers(request.headers);
  if (activeToken) {
    const existingCookie = requestHeaders.get("cookie") || "";
    if (!existingCookie.includes("izah_session_token")) {
      requestHeaders.set(
        "cookie",
        `${existingCookie ? existingCookie + "; " : ""}izah_session_token=${activeToken}; better-auth.session_token=${activeToken}`
      );
    }
    requestHeaders.set("x-session-token", activeToken);
    requestHeaders.set("authorization", `Bearer ${activeToken}`);
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (activeToken) {
    const isHttps = request.nextUrl.protocol === "https:";
    const cookieOpts = {
      httpOnly: true,
      secure: isHttps,
      sameSite: (isHttps ? "none" : "lax") as "none" | "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    };
    response.cookies.set("izah_session_token", activeToken, cookieOpts);
    response.cookies.set("better-auth.session_token", activeToken, cookieOpts);
    if (isHttps) {
      response.cookies.set("__Secure-better-auth.session_token", activeToken, cookieOpts);
    }
  }

  return applyCorsHeaders(response, origin, isAllowedOrigin);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|eot|webmanifest)).*)",
  ],
};
