import type { SessionInfo } from "./types";

// ============================================================================
// Active session window — D11/D12.
//
// A "Sessão ativa" (active session) is one whose last activity is at most
// the active window old; older sessions are collapsed under the "Antigas (N)"
// subsection inside their project. The window is configurable via the
// Rocinante Settings → Sidebar tab and persisted to localStorage (web-side
// preference; NOT omp's native `config.yml`). The constant below is the
// fallback when no preference is stored.
// ============================================================================

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const STORAGE_KEY = "omp-web:active-session-window-hours";
const MIN_HOURS = 1;
const MAX_HOURS = 168;

/** Default active window (12 hours) when the user has no preference stored. */
export const ACTIVE_SESSION_WINDOW_MS: number = TWELVE_HOURS_MS;

/** Read the active window in milliseconds from localStorage, falling back to
 *  the 12h default. Clamps out-of-range values to the supported range. */
export function readActiveSessionWindowMs(now: number = Date.now()): number {
  if (typeof window === "undefined") return ACTIVE_SESSION_WINDOW_MS;
  let hours = 12;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = Number.parseInt(raw, 10);
      if (Number.isFinite(parsed)) hours = parsed;
    }
  } catch {
    // ignore quota / privacy-mode errors
  }
  if (!Number.isFinite(hours) || hours < MIN_HOURS) hours = MIN_HOURS;
  if (hours > MAX_HOURS) hours = MAX_HOURS;
  return hours * 60 * 60 * 1000;
}

/** True when the session's `modified` timestamp is at most the active window
 *  before `now`. Sessions without `modified` are treated as active. */
export function isSessionActive(
  session: Pick<SessionInfo, "modified">,
  now: number = Date.now(),
  windowMs: number = ACTIVE_SESSION_WINDOW_MS,
): boolean {
  const modifiedMs = Date.parse(session.modified);
  if (Number.isNaN(modifiedMs)) return true;
  return now - modifiedMs <= windowMs;
}

/** Partition sessions into [active, old] preserving input order. */
export function partitionByActivity(
  sessions: SessionInfo[],
  now: number = Date.now(),
  windowMs: number = ACTIVE_SESSION_WINDOW_MS,
): { active: SessionInfo[]; old: SessionInfo[] } {
  const active: SessionInfo[] = [];
  const old: SessionInfo[] = [];
  for (const session of sessions) {
    if (isSessionActive(session, now, windowMs)) active.push(session);
    else old.push(session);
  }
  return { active, old };
}
