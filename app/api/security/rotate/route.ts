import { NextResponse } from "next/server";
import { clearAllRevocations, buildClearCookie, signToken } from "@/lib/auth-token";
import { generateSecret, getEnvPath, writeEnv } from "@/lib/security-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = generateSecret();
  writeEnv({ secret, enabled: true });
  clearAllRevocations();
  const { token, payload } = signToken(secret);
  const https = request.headers.get("x-forwarded-proto") === "https";
  const response = NextResponse.json({
    ok: true,
    rotated: true,
    envPath: getEnvPath(),
    secret,
    exp: payload.exp,
    note: "Existing sessions were invalidated. The new key is shown once — save it now.",
  });
  // The freshly-issued token is for the convenience of the rotator; the
  // proxy will also need a token, but the user must restart the server
  // before the new secret takes effect on signing. Until then, the
  // existing cookie (if any) is invalid; the user re-logs in with the
  // new key. We still set the cookie so the next browser refresh sees
  // the new session.
  const parts = [
    `rocinante_auth=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${24 * 60 * 60}`,
  ];
  if (https) parts.push("Secure");
  response.headers.append("Set-Cookie", parts.join("; "));
  return response;
}
