import { NextResponse } from "next/server";
import { COOKIE_NAME, getSecret, isAuthEnabled, verifyToken } from "@/lib/auth-token";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ enabled: false, authenticated: false });
  }
  const secret = getSecret();
  if (!secret) {
    return NextResponse.json({ enabled: true, authenticated: false, error: "Server misconfiguration" }, { status: 500 });
  }
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  const token = match?.[1] ? decodeURIComponent(match[1]) : null;
  if (!token) {
    return NextResponse.json({ enabled: true, authenticated: false });
  }
  const result = verifyToken(token, secret);
  if (!result.ok) {
    return NextResponse.json({ enabled: true, authenticated: false });
  }
  return NextResponse.json({ enabled: true, authenticated: true, sub: result.payload.sub, exp: result.payload.exp });
}
