// In-memory session registry for the access-key protection feature.
// Lives in `lib/` (not `app/api/`) because the active-session map is
// used by both the auth login route (which adds sessions) and the
// security/sessions route (which lists + revokes them). Exporting a
// non-route helper from a route file (e.g. `app/api/security/sessions/
// route.ts`) breaks Next.js 16's strict route-export type check — only
// GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS + the `config`/`dynamic`/
// `revalidate` exports are allowed. Keeping the helper in `lib/` avoids
// that constraint.

import type { ActiveSession } from "@/lib/auth-token-types";

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

export function pruneExpiredSessions(nowSeconds: number): void {
  for (const [jti, session] of sessions) {
    if (session.exp <= nowSeconds) sessions.delete(jti);
  }
}

export function registerSession(payload: { jti: string; sub: string; iat: number; exp: number }, request?: Request): void {
  const ip = request ? clientIpFromHeaders(request.headers) : null;
  const userAgent = request?.headers.get("user-agent") ?? null;
  sessions.set(payload.jti, { jti: payload.jti, sub: payload.sub, iat: payload.iat, exp: payload.exp, ip, userAgent });
}

export function listActiveSessions(): ActiveSession[] {
  return Array.from(sessions.values());
}

export function getActiveSession(jti: string): ActiveSession | null {
  return sessions.get(jti) ?? null;
}

export function deleteActiveSession(jti: string): boolean {
  return sessions.delete(jti);
}
