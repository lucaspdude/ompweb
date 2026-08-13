import { NextResponse } from "next/server";
import { COOKIE_NAME, buildClearCookie, denyToken, getSecret, isAuthEnabled, verifyToken } from "@/lib/auth-token";

export const dynamic = "force-dynamic";

function isHttpsFromHeaders(headers: Headers): boolean {
  const forwardedProto = headers.get("x-forwarded-proto");
  return forwardedProto === "https";
}

export async function POST(request: Request) {
  const https = isHttpsFromHeaders(request.headers);
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  const token = match?.[1] ? decodeURIComponent(match[1]) : null;

  if (token && isAuthEnabled()) {
    const secret = getSecret();
    if (secret) {
      const result = verifyToken(token, secret);
      if (result.ok) {
        denyToken(result.payload.jti, result.payload.exp);
      }
    }
  }

  const response = NextResponse.json({ ok: true });
  response.headers.append("Set-Cookie", buildClearCookie(https));
  return response;
}
