/**
 * Static list of OAuth providers in the upstream `omp` (oh-my-pi) registry.
 *
 * The list is duplicated from the source instead of queried at runtime
 * because the RPC `get_login_providers` payload doesn't carry the
 * `usesCallbackServer` flag. Re-deriving it from a set in `lib/omp/`
 * keeps the OMP_UI grouping in D11 (onboarding modal) honest without
 * pinning a hot code path to upstream internals.
 *
 * To refresh against the upstream registry, run the helper:
 *
 *   curl -fsSL https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/ai/src/registry/oauth/index.ts
 *
 * Snapshot 2026-08-13.
 */

/** Providers that perform a real OAuth round-trip via a callback server
 * (`usesCallbackServer: true` in the upstream registry). */
export const OAUTH_PROVIDERS_WITH_CALLBACK: ReadonlySet<string> = new Set([
  "anthropic",
  "github-copilot",
  "cursor",
  "devin",
  "google-gemini-cli",
  "google-antigravity",
  "openai-codex",
  "openai-codex-device",
  "gitlab-duo",
  "gitlab-duo-workflow",
  "xai-oauth",
]);

/** Providers that use the login browser flow but paste a key back rather
 * than completing OAuth via a callback. The upstream registry comments
 * flag these as "not OAuth" — we expose them through the same login
 * button but skip the callback-server routing. */
export const OAUTH_PROVIDERS_LOGIN_PASTE_KEY: ReadonlySet<string> = new Set([
  "opencode",
  "minimax-code",
  "minimax-code-cn",
  "xiaomi",
  "zai",
  "zai-coding-plan",
  "kimi-code",
  "qwen-portal",
  "perplexity",
  "ollama-cloud",
  "wafer-serverless",
]);

/** All provider ids that go through the `get_login_providers` flow. */
export const ALL_OAUTH_PROVIDER_IDS: ReadonlySet<string> = new Set([
  ...OAUTH_PROVIDERS_WITH_CALLBACK,
  ...OAUTH_PROVIDERS_LOGIN_PASTE_KEY,
]);

export type OAuthKind = "callback" | "paste-key" | "none";

export function oauthKindFor(providerId: string): OAuthKind {
  if (OAUTH_PROVIDERS_WITH_CALLBACK.has(providerId)) return "callback";
  if (OAUTH_PROVIDERS_LOGIN_PASTE_KEY.has(providerId)) return "paste-key";
  return "none";
}
