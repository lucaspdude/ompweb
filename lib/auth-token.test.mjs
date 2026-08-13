import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  signToken,
  verifyToken,
  denyToken,
  isTokenRevoked,
  clearAllRevocations,
  shouldRenew,
  buildAuthCookie,
  buildClearCookie,
  safeStringEqual,
  isAuthEnabled,
  _setAuthEnabledForTest,
  COOKIE_NAME,
  AUTH_USERNAME,
  __testInternals,
} = await jiti.import("./auth-token.ts");

const SECRET = "test-secret-32-bytes-aaaaaaaaaaaa";
const NOW = 1_700_000_000;

test.beforeEach(() => {
  clearAllRevocations();
  _setAuthEnabledForTest(null);
  delete process.env.ROCINANTE_AUTH_ENABLED;
});

test("signs and verifies a token round-trip", () => {
  const { token, payload } = signToken(SECRET, {}, "fixed-jti", NOW);
  assert.match(token, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(payload.sub, AUTH_USERNAME);
  assert.equal(payload.iat, NOW);
  assert.equal(payload.exp, NOW + 24 * 60 * 60);
  assert.equal(payload.jti, "fixed-jti");

  const result = verifyToken(token, SECRET, NOW);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.payload.jti, "fixed-jti");
    assert.equal(result.payload.iat, NOW);
  }
});

test("rejects an empty token", () => {
  const result = verifyToken("", SECRET);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "malformed");
});

test("rejects a malformed token (too few parts)", () => {
  const result = verifyToken("v1.abc", SECRET);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "malformed");
});

test("rejects a wrong-version token", () => {
  const { token } = signToken(SECRET, {}, "jti", NOW);
  const bumped = token.replace(/^v1\./, "v2.");
  const result = verifyToken(bumped, SECRET, NOW);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "wrong-version");
});

test("rejects a token signed with a different secret", () => {
  const { token } = signToken("a-different-secret", {}, "jti", NOW);
  const result = verifyToken(token, SECRET, NOW);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "bad-signature");
});

test("rejects a token whose signature was tampered", () => {
  const { token } = signToken(SECRET, {}, "jti", NOW);
  const parts = token.split(".");
  const last = parts[2].slice(-1);
  const swapped = last === "A" ? "B" : "A";
  const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -1)}${swapped}`;
  const result = verifyToken(tampered, SECRET, NOW);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "bad-signature");
});

test("rejects an expired token", () => {
  const { token } = signToken(SECRET, { ttlSeconds: 60 }, "jti", NOW);
  const result = verifyToken(token, SECRET, NOW + 120);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "expired");
});

test("deny-list revokes a token until it expires from the list", () => {
  const { token, payload } = signToken(SECRET, {}, "jti-revoke", NOW);
  assert.equal(isTokenRevoked("jti-revoke", NOW), false);
  denyToken(payload.jti, payload.exp, NOW);

  const result = verifyToken(token, SECRET, NOW + 1);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "revoked");
});

test("deny-list auto-prunes entries past their expiresAt", () => {
  denyToken("jti-old", NOW - 10, NOW - 10);
  const future = NOW + 25 * 60 * 60;
  assert.equal(isTokenRevoked("jti-old", future), false);
});

test("shouldRenew returns true within the renewal window and below the hard cap", () => {
  const renewPayload = { sub: "admin", iat: NOW - 3600, exp: NOW + 6 * 3600, jti: "x" };
  assert.equal(shouldRenew(renewPayload, NOW), true);

  const freshPayload = { sub: "admin", iat: NOW - 3600, exp: NOW + 18 * 3600, jti: "x" };
  assert.equal(shouldRenew(freshPayload, NOW), false);

  const oldPayload = { sub: "admin", iat: NOW - 8 * 24 * 3600, exp: NOW + 6 * 3600, jti: "x" };
  assert.equal(shouldRenew(oldPayload, NOW), false);
});

test("buildAuthCookie emits HttpOnly + SameSite=Strict + Max-Age + Path", () => {
  const cookie = buildAuthCookie("token-123", false);
  assert.match(cookie, new RegExp(`^${COOKIE_NAME}=token-123`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Max-Age=86400/);
  assert.match(cookie, /Path=\//);
  assert.doesNotMatch(cookie, /Secure/);
});

test("buildAuthCookie adds Secure on HTTPS", () => {
  const cookie = buildAuthCookie("token-123", true);
  assert.match(cookie, /Secure/);
});

test("buildClearCookie zeroes the cookie", () => {
  const cookie = buildClearCookie(false);
  assert.match(cookie, new RegExp(`^${COOKIE_NAME}=`));
  assert.match(cookie, /Max-Age=0/);
});

test("safeStringEqual returns true for equal strings and false otherwise", () => {
  assert.equal(safeStringEqual("abc", "abc"), true);
  assert.equal(safeStringEqual("abc", "abd"), false);
  assert.equal(safeStringEqual("abc", "abcd"), false);
});

test("isAuthEnabled respects the env var and the test override", () => {
  _setAuthEnabledForTest(null);
  delete process.env.ROCINANTE_AUTH_ENABLED;
  assert.equal(isAuthEnabled(), false);

  _setAuthEnabledForTest(true);
  assert.equal(isAuthEnabled(), true);
  process.env.ROCINANTE_AUTH_ENABLED = "false";
  assert.equal(isAuthEnabled(), true, "override beats env");

  _setAuthEnabledForTest(null);
  assert.equal(isAuthEnabled(), false);

  process.env.ROCINANTE_AUTH_ENABLED = "true";
  assert.equal(isAuthEnabled(), true);
  process.env.ROCINANTE_AUTH_ENABLED = "1";
  assert.equal(isAuthEnabled(), true);
  process.env.ROCINANTE_AUTH_ENABLED = "TRUE";
  assert.equal(isAuthEnabled(), true);
  process.env.ROCINANTE_AUTH_ENABLED = "no";
  assert.equal(isAuthEnabled(), false);
});

test("denyToken respects a custom expiresAt older than now+24h", () => {
  const exp = NOW + 365 * 24 * 60 * 60;
  denyToken("long-lived", exp, NOW);
  const tomorrow = NOW + 25 * 60 * 60;
  assert.equal(isTokenRevoked("long-lived", tomorrow), true);
});

test("signToken honors iat override for sliding renewal", () => {
  const oldIat = NOW;
  const later = oldIat + 23 * 60 * 60;
  const { token, payload } = signToken(SECRET, { iat: oldIat }, "jti-renew", later);
  assert.equal(payload.iat, oldIat);
  assert.equal(payload.exp, oldIat + 24 * 60 * 60);
  const result = verifyToken(token, SECRET, later);
  assert.equal(result.ok, true);
});

test("__testInternals surfaces the expected constants", () => {
  assert.equal(__testInternals.VERSION, "v1");
  assert.equal(__testInternals.RENEW_THRESHOLD_SECONDS, 12 * 60 * 60);
  assert.equal(__testInternals.HARD_CAP_SECONDS, 7 * 24 * 60 * 60);
  assert.ok(__testInternals.revocations instanceof Map);
});
