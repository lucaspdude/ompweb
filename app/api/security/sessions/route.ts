// In-memory session list. Reads from the in-memory deny-list (revocations)
// + a parallel map of active tokens. We do not persist sessions to disk
// because Rocinante runs as a single Next.js process; on restart everyone
// re-logs in. This is acceptable per the feature doc O3.
//
// The session map + registerSession helper live in lib/security-sessions.ts
// so this file is a pure route file (Next.js 16 rejects extra exports).

import { NextResponse } from "next/server";
import { denyToken, isAuthEnabled } from "@/lib/auth-token";
import {
  deleteActiveSession,
  getActiveSession,
  listActiveSessions,
  pruneExpiredSessions,
} from "@/lib/security-sessions";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAuthEnabled()) {
    return NextResponse.json({ enabled: false, sessions: [] });
  }
  const now = Math.floor(Date.now() / 1000);
  pruneExpiredSessions(now);
  const list = listActiveSessions().map((s) => ({ jti: s.jti, sub: s.sub, iat: s.iat, exp: s.exp, ip: s.ip, userAgent: s.userAgent }));
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
  const session = getActiveSession(body.jti);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  denyToken(body.jti, session.exp);
  deleteActiveSession(body.jti);
  return NextResponse.json({ ok: true });
}
