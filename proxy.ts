// Next.js proxy (formerly "middleware") that gates every request behind the
// access-key cookie when access-key protection is enabled. The path matcher
// is `/:path*` (every route). When auth is OFF, this proxy is a no-op aside
// from the cross-origin check below.
//
// Auth state is read from `lib/auth-token.ts`. The token is HMAC-SHA256 over
// a base64url JSON payload (see lib/auth-token.ts for the format). Cookies
// are HttpOnly + SameSite=Strict; on HTTPS the Secure flag is added.
// Sliding renewal: when the verified token is within 12h of expiring and
// still under the 7d hard cap, the proxy re-issues a new cookie via
// Set-Cookie so the user does not notice the rotation.

import { NextResponse, type NextRequest } from "next/server";
import { isApiRequestOriginAllowed, shouldCheckApiRequestOrigin } from "@/lib/request-security";
import {
  COOKIE_NAME,
  buildAuthCookie,
  buildClearCookie,
  getSecret,
  isAuthEnabled,
  shouldRenew,
  signToken,
  verifyToken,
  type TokenPayload,
} from "@/lib/auth-token";

const PUBLIC_PATHS: ReadonlyArray<string> = [
  "/login",
  "/api/auth/login",
  "/api/auth/me",
  "/api/security/status",
  "/favicon.ico",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isApiRequest(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

function isHttps(request: NextRequest): boolean {
  if (request.nextUrl.protocol === "https:") return true;
  const forwardedProto = request.headers.get("x-forwarded-proto");
  return forwardedProto === "https";
}

function buildLoginRedirect(request: NextRequest): NextResponse {
  const loginUrl = new URL("/login", request.url);
  if (request.nextUrl.pathname !== "/") {
    loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  }
  return NextResponse.redirect(loginUrl, { status: 302 });
}

type VerifyFailureReason = "no-cookie" | "malformed" | "bad-signature" | "expired" | "revoked" | "wrong-version";
type VerifyOutcome = { ok: true; payload: TokenPayload } | { ok: false; reason: VerifyFailureReason };

function verifyCookie(cookie: string | null, secret: string): VerifyOutcome {
  if (!cookie) return { ok: false, reason: "no-cookie" };
  const result = verifyToken(cookie, secret);
  if (result.ok) return { ok: true, payload: result.payload };
  return { ok: false, reason: result.reason };
}

function maybeRenewCookie(response: NextResponse, payload: TokenPayload, secret: string, https: boolean): void {
  if (!shouldRenew(payload)) return;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const { token } = signToken(secret, { iat: payload.iat }, payload.jti, nowSeconds);
  response.headers.append("Set-Cookie", buildAuthCookie(token, https));
}

export function proxy(request: NextRequest) {
  if (!isAuthEnabled()) {
    if (shouldCheckApiRequestOrigin(request) && !isApiRequestOriginAllowed(request)) {
      return NextResponse.json({ error: "Cross-origin API requests are not allowed" }, { status: 403 });
    }
    return NextResponse.next();
  }

  const secret = getSecret();
  if (!secret) {
    console.error("[proxy] ROCINANTE_AUTH_ENABLED=true but ROCINANTE_SECRET is missing");
    if (isApiRequest(request.nextUrl.pathname)) {
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }
    return new NextResponse("Server misconfiguration", { status: 500 });
  }

  const https = isHttps(request);
  const cookie = request.cookies.get(COOKIE_NAME)?.value ?? null;
  const pathname = request.nextUrl.pathname;

  if (isPublicPath(pathname)) {
    if (shouldCheckApiRequestOrigin(request) && !isApiRequestOriginAllowed(request)) {
      return NextResponse.json({ error: "Cross-origin API requests are not allowed" }, { status: 403 });
    }
    const outcome = verifyCookie(cookie, secret);
    const response = NextResponse.next();
    if (outcome.ok) {
      response.headers.set("x-roc-user", outcome.payload.sub);
      maybeRenewCookie(response, outcome.payload, secret, https);
    } else if (cookie) {
      response.headers.append("Set-Cookie", buildClearCookie(https));
    }
    return response;
  }

  const outcome = verifyCookie(cookie, secret);
  if (!outcome.ok) {
    if (isApiRequest(pathname)) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    return buildLoginRedirect(request);
  }

  const response = NextResponse.next();
  response.headers.set("x-roc-user", outcome.payload.sub);
  maybeRenewCookie(response, outcome.payload, secret, https);
  return response;
}

export const config = { matcher: "/:path*" };
