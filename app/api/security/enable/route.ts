import { NextResponse } from "next/server";
import { clearAllRevocations, getSecret, safeStringEqual, signToken } from "@/lib/auth-token";
import { getEnvPath, generateSecret, readEnvFile, writeEnv } from "@/lib/security-store";

export const dynamic = "force-dynamic";

interface EnableBody {
  password?: unknown;
}

export async function POST(request: Request) {
  let body: EnableBody = {};
  try {
    body = (await request.json().catch(() => ({}))) as EnableBody;
  } catch {
    // empty body is allowed — enables with a freshly generated secret
  }
  const state = readEnvFile();
  let secret: string;
  let rotated = false;
  if (state.hasSecret && state.enabled) {
    // Already on. No-op (return existing secret marker).
    return NextResponse.json({ ok: true, enabled: true, envPath: getEnvPath() });
  }
  if (typeof body.password === "string" && body.password.length > 0) {
    // Caller provided a password to adopt; verify it matches the existing
    // secret if one is present.
    if (state.hasSecret) {
      const existing = getSecret();
      if (!existing || !safeStringEqual(body.password, existing)) {
        return NextResponse.json({ error: "Password does not match the existing secret" }, { status: 400 });
      }
    }
    secret = body.password;
  } else if (state.hasSecret) {
    secret = getSecret() ?? generateSecret();
  } else {
    secret = generateSecret();
    rotated = true;
  }
  writeEnv({ secret, enabled: true });
  clearAllRevocations();
  // Issue a token so the UI can immediately flip to "logged in" without a
  // second roundtrip.
  const { token, payload } = signToken(secret);
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const https = forwardedProto === "https";
  const response = NextResponse.json({ ok: true, enabled: true, envPath: getEnvPath(), secret, exp: payload.exp, rotated });
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
