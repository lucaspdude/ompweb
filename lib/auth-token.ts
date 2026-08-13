// HMAC-signed session tokens for Rocinante's access-key protection layer.
//
// Why a custom format instead of JWT: single-server / single-secret, no need
// for JWK rotation or a public-key verify path. The custom format (`v1.<payload>.
// <signature>`) keeps the implementation ~100 lines and lets us add a version
// prefix later without breaking existing tokens.
//
// Token shape:
//   v1.<base64url(JSON payload)>.<base64url(HMAC-SHA256(secret, "v1." + payload))>
//
// Payload: { sub, iat, exp, jti } where
//   sub — username (constant "admin" today; reserved for future multi-user)
//   iat — issued-at, unix seconds
//   exp — expires-at, unix seconds (iat + 24h, sliding)
//   jti — random 16-byte hex; used by the deny-list for revocation
//
// TTL semantics (see docs/in-progress/2026-08-13-access-key-protection.md D8):
//   - Initial: exp = iat + 24h.
//   - Sliding: if exp - now < 12h on a verified request, the proxy re-issues
//     the cookie with exp = now + 24h (the user does not notice).
//   - Hard cap: iat + 7d. Even with sliding renewals, we refuse to renew past
//     iat + 7d so a stolen cookie can be used for at most 7 days of activity.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const VERSION = "v1";
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
const RENEW_THRESHOLD_SECONDS = 12 * 60 * 60;
const HARD_CAP_SECONDS = 7 * 24 * 60 * 60;

export const COOKIE_NAME = "rocinante_auth";
export const TOKEN_TTL_SECONDS = DEFAULT_TTL_SECONDS;
export const HARD_CAP_SECONDS_TOTAL = HARD_CAP_SECONDS;

/** The username we attach to every session. Single-user today; reserved
 * for future multi-user. */
export const AUTH_USERNAME = "admin";

/** A token that has been verified. `iat` is preserved so the proxy can
 * enforce the hard-cap check on renewal. */
export interface TokenPayload {
  sub: string;
  iat: number;
  exp: number;
  jti: string;
}

interface RevocationEntry {
  /** When the entry can be dropped from the map. */
  expiresAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __rocinanteAuthRevocations: Map<string, RevocationEntry> | undefined;
  // eslint-disable-next-line no-var
  var __rocinanteAuthEnabledOverride: boolean | undefined;
}

const revocations: Map<string, RevocationEntry> =
  globalThis.__rocinanteAuthRevocations ?? new Map<string, RevocationEntry>();
globalThis.__rocinanteAuthRevocations = revocations;

function pruneRevocations(now: number): void {
  for (const [jti, entry] of revocations) {
    if (entry.expiresAt <= now) revocations.delete(jti);
  }
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

/** Read the configured secret from the environment. The installer writes
 * `ROCINANTE_SECRET` to `${SHARE_DIR}/.env` and Next.js auto-loads it on
 * startup, so this resolves to the persisted value out of the box. */
export function getSecret(): string | null {
  const value = process.env.ROCINANTE_SECRET;
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

export function isAuthEnabled(): boolean {
  if (globalThis.__rocinanteAuthEnabledOverride !== undefined) {
    return globalThis.__rocinanteAuthEnabledOverride;
  }
  const value = process.env.ROCINANTE_AUTH_ENABLED;
  if (typeof value !== "string") return false;
  return value.toLowerCase() === "true" || value === "1";
}

/** Test-only escape hatch. Pass `null` to clear the override. */
export function _setAuthEnabledForTest(value: boolean | null): void {
  globalThis.__rocinanteAuthEnabledOverride = value === null ? undefined : value;
}

export interface SignOptions {
  /** Override the default 24h TTL. */
  ttlSeconds?: number;
  /** Optional issued-at override; used by sliding renewal. */
  iat?: number;
}

export interface SignedToken {
  token: string;
  payload: TokenPayload;
}

/** Sign a new token. The caller is responsible for `iat` if renewing —
 * pass the original `iat` to preserve the hard-cap. */
export function signToken(
  secret: string,
  options: SignOptions = {},
  jti: string = randomBytes(16).toString("hex"),
  now: number = Math.floor(Date.now() / 1000),
): SignedToken {
  const iat = options.iat ?? now;
  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const exp = iat + ttl;
  const payload: TokenPayload = { sub: AUTH_USERNAME, iat, exp, jti };
  const encoded = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const signature = base64UrlEncode(createHmac("sha256", secret).update(`${VERSION}.${encoded}`, "utf8").digest());
  return { token: `${VERSION}.${encoded}.${signature}`, payload };
}

export type VerifyFailure = "malformed" | "bad-signature" | "expired" | "revoked" | "wrong-version";

export type VerifyResult =
  | { ok: true; payload: TokenPayload }
  | { ok: false; reason: VerifyFailure };

/** Verify a token's signature, expiration, and revocation status. */
export function verifyToken(token: string, secret: string, now: number = Math.floor(Date.now() / 1000)): VerifyResult {
  if (typeof token !== "string" || token.length === 0) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [version, encoded, signature] = parts;
  if (version !== VERSION) return { ok: false, reason: "wrong-version" };

  let payload: TokenPayload;
  try {
    const json = base64UrlDecode(encoded).toString("utf8");
    const parsed = JSON.parse(json) as Partial<TokenPayload>;
    if (
      typeof parsed.sub !== "string" ||
      typeof parsed.iat !== "number" ||
      typeof parsed.exp !== "number" ||
      typeof parsed.jti !== "string"
    ) {
      return { ok: false, reason: "malformed" };
    }
    payload = parsed as TokenPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const expectedSignature = createHmac("sha256", secret).update(`${VERSION}.${encoded}`, "utf8").digest();
  let providedSignature: Buffer;
  try {
    providedSignature = base64UrlDecode(signature);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (expectedSignature.length !== providedSignature.length || !timingSafeEqual(expectedSignature, providedSignature)) {
    return { ok: false, reason: "bad-signature" };
  }

  if (payload.exp <= now) return { ok: false, reason: "expired" };

  pruneRevocations(now);
  if (revocations.has(payload.jti)) return { ok: false, reason: "revoked" };

  return { ok: true, payload };
}

/** Revoke a single token by its `jti`. The entry auto-expires at the
 * token's `exp` (or now + 24h, whichever is later) so the deny-list never
 * grows unbounded. */
export function denyToken(jti: string, exp: number, now: number = Math.floor(Date.now() / 1000)): void {
  const expiresAt = Math.max(exp, now + DEFAULT_TTL_SECONDS);
  revocations.set(jti, { expiresAt });
  pruneRevocations(now);
}

export function isTokenRevoked(jti: string, now: number = Math.floor(Date.now() / 1000)): boolean {
  pruneRevocations(now);
  return revocations.has(jti);
}

export function clearAllRevocations(): void {
  revocations.clear();
}

/** Should the proxy slide this token's expiry? True when the token is
 * valid and within `RENEW_THRESHOLD_SECONDS` of expiring, but still
 * inside the hard-cap window. */
export function shouldRenew(payload: TokenPayload, now: number = Math.floor(Date.now() / 1000)): boolean {
  if (payload.exp - now >= RENEW_THRESHOLD_SECONDS) return false;
  if (now - payload.iat >= HARD_CAP_SECONDS) return false;
  return true;
}

/** Build a Set-Cookie value for the given token. Adds the Secure flag on
 * HTTPS connections; loopback HTTP stays unsigned. */
export function buildAuthCookie(token: string, secure: boolean): string {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${DEFAULT_TTL_SECONDS}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearCookie(secure: boolean): string {
  const parts = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** Constant-time string comparison, used by the login route. */
export function safeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export const __testInternals = {
  base64UrlEncode,
  base64UrlDecode,
  VERSION,
  RENEW_THRESHOLD_SECONDS,
  HARD_CAP_SECONDS,
  revocations,
};
