// In-memory session list. Reads from the in-memory deny-list (revocations)
// + a parallel map of active tokens. We do not persist sessions to disk
// because Rocinante runs as a single Next.js process; on restart everyone
// re-logs in. This is acceptable per the feature doc O3.

import { NextResponse } from "next/server";
import { COOKIE_NAME, __testInternals, denyToken, isAuthEnabled, verifyToken } from "@/lib/auth-token";

export const dynamic = "force-dynamic";

interface ActiveSession {
  jti: string;
  sub: string;
  iat: number;
  exp: number;
  ip: string | null;
  userAgent: string | null;
}

// Tracked sessions live in globalThis for hot-reload safety.
declare global {
  // eslint-disable-next-line no-var
  var __rocinanteAuthSessions: Map<string, ActiveSession> | undefined;
}

const sessions: Map<string, ActiveSession> = globalThis.__rocinanteAuthSessions ?? new Map<string, ActiveSession>();
globalThis.__rocinanteAuthSessions = sessions;

function clientIpFromHeaders(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return headers.get("x-real-ip") ?? null;
}

function pruneExpiredSessions(nowSeconds: number): void {
  for (const [jti, session] of sessions) {
    if (session.exp <= nowSeconds) sessions.delete(jti);
  }
}

export async function GET() {
  if (!isAuthEnabled()) {
    return NextResponse.json({ enabled: false, sessions: [] });
  }
  const now = Math.floor(Date.now() / 1000);
  pruneExpiredSessions(now);
  const list = Array.from(sessions.values()).map((s) => ({ jti: s.jti, sub: s.sub, iat: s.iat, exp: s.exp, ip: s.ip, userAgent: s.userAgent }));
  return NextResponse.json({ enabled: true, sessions: list });
}

interface RevokeBody {
  jti?: unknown;
}

export async function DELETE(request: Request) {
  let body: RevokeBody;
  try {
    body = (await request.json()) as RevokeBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof body.jti !== "string" || body.jti.length === 0) {
    return NextResponse.json({ error: "jti is required" }, { status: 400 });
  }
  const session = sessions.get(body.jti);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  denyToken(body.jti, session.exp);
  sessions.delete(body.jti);
  return NextResponse.json({ ok: true });
}

// Test-only helper for the route — but it isn't actually exposed.
// Keep the import alive in case future code paths need it.
void COOKIE_NAME;
void verifyToken;
void clientIpFromHeaders;
// The exported helper that lets login route register a session. Kept in
// this file so all session state is colocated.
export function registerSession(payload: { jti: string; sub: string; iat: number; exp: number }, request?: Request): void {
  const ip = request ? clientIpFromHeaders(request.headers) : null;
  const userAgent = request?.headers.get("user-agent") ?? null;
  sessions.set(payload.jti, { jti: payload.jti, sub: payload.sub, iat: payload.iat, exp: payload.exp, ip, userAgent });
}

// We keep the test-internals import for potential future use but the
// current implementation does not need it.
void __testInternals;
