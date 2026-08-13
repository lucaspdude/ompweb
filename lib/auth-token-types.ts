// Shared types for the access-key protection feature. Lives in `lib/`
// (not `app/api/`) so that `lib/security-sessions.ts` can import it
// without pulling route-side modules into a non-route path.

export interface ActiveSession {
  jti: string;
  sub: string;
  iat: number;
  exp: number;
  ip: string | null;
  userAgent: string | null;
}
