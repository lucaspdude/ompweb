import { NextResponse } from "next/server";
import { buildAuthCookie, getSecret, isAuthEnabled, safeStringEqual, signToken } from "@/lib/auth-token";
import { registerSession } from "@/app/api/security/sessions/route";

export const dynamic = "force-dynamic";

interface LoginBody {
  password?: unknown;
}

export async function POST(request: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ error: "Access-key protection is not enabled" }, { status: 400 });
  }
  const secret = getSecret();
  if (!secret) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof body.password !== "string" || body.password.length === 0) {
    return NextResponse.json({ error: "Password is required" }, { status: 400 });
  }
  if (!safeStringEqual(body.password, secret)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }
  const { token, payload } = signToken(secret);
  registerSession(payload, request);
  const https = request.headers.get("x-forwarded-proto") === "https";
  const response = NextResponse.json({ ok: true, exp: payload.exp });
  response.headers.append("Set-Cookie", buildAuthCookie(token, https));
  return response;
}
