// Shared between the browser (locale selection) and the API routes that spawn
// `omp --mode rpc-ui`. The browser mirrors the selected locale into a cookie so
// the server can append a matching language directive to the agent's system
// prompt via --append-system-prompt. Pure module: no Node or React imports, so
// both bundles can include it.

/** Cookie mirroring the i18n localStorage key ("rocinante:lang") for the server. */
export const LANGUAGE_COOKIE = "rocinante:lang";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** System-prompt directive per non-English locale. English is omp's default
 * language, so it gets no directive. Values are fixed strings — the cookie only
 * ever selects a key, so user input never reaches the omp CLI args. */
const LANGUAGE_DIRECTIVES: Record<string, string> = {
  "zh-CN":
    "The user has selected Simplified Chinese (zh-CN) as their preferred language. Always respond in Simplified Chinese — including all explanations, summaries, and status updates — even when the user writes in another language, unless they explicitly ask for a different language. Keep code, commands, file paths, and technical identifiers in their original form.",
  ja: "The user has selected Japanese (ja) as their preferred language. Always respond in Japanese — including all explanations, summaries, and status updates — even when the user writes in another language, unless they explicitly ask for a different language. Keep code, commands, file paths, and technical identifiers in their original form.",
  "pt-BR":
    "The user has selected Brazilian Portuguese (pt-BR) as their preferred language. Always respond in Brazilian Portuguese — including all explanations, summaries, and status updates — even when the user writes in another language, unless they explicitly ask for a different language. Keep code, commands, file paths, and technical identifiers in their original form.",
};

/** Extract the language directive from a request's omp-lang cookie. */
export function languageDirectiveFromRequest(req: Request): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== LANGUAGE_COOKIE) continue;
    const value = decodeURIComponent(part.slice(eq + 1).trim());
    return LANGUAGE_DIRECTIVES[value];
  }
  return undefined;
}

/** Mirror the locale into the cookie read by languageDirectiveFromRequest.
 * No-op outside the browser (SSR, tests). */
export function persistLanguageCookie(locale: string): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${LANGUAGE_COOKIE}=${encodeURIComponent(locale)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
  } catch {
    // ignore storage errors (private mode etc.)
  }
}
