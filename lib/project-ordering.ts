import type { ManagedProject, SessionInfo } from "./types";

// ============================================================================
// Pure ordering/grouping helpers shared between the sidebar and unit tests.
//
// Containment model (D10):
//   Each session associates to the deepest registered project whose
//   canonical path equals or contains the session's `projectRoot` (worktrees
//   are already collapsed to the main repo by `resolveProject`, so the
//   worktree→main-repo grouping is preserved). Sessions whose cwd falls
//   outside any registered project surface as a null key (rendered as the
//   "Other sessions" pseudo-group in the sidebar).
//
//   This deliberately diverges from upstream `lib/worktree.ts:101-104`
//   ("sub-directory cwds keep their own project identity") for the
//   custom-projects sidebar — see ADR 0001.
// ============================================================================

const PATH_SEP = "/";

/** Effective project for a session: exact match wins; otherwise the longest
 *  registered project whose path is a strict ancestor of the session's
 *  `projectRoot` (fallback to `cwd` while server-side `projectRoot` is
 *  still being resolved). Returns null when no registered project
 *  contains the session — the caller renders it under "Other sessions". */
export function effectiveProjectPath(
  session: SessionInfo,
  projects: ManagedProject[],
): string | null {
  const candidate = session.projectRoot ?? session.cwd;
  if (!candidate) return null;
  let best: ManagedProject | null = null;
  for (const project of projects) {
    if (candidate === project.path) return project.path;
    if (candidate.startsWith(project.path + PATH_SEP)) {
      if (!best || project.path.length > best.path.length) best = project;
    }
  }
  return best ? best.path : null;
}

/** Latest `modified` timestamp per project (effective project key), used
 *  for the by-activity ordering of the project list. */
export function projectActivityByPath(
  sessions: SessionInfo[],
  projects: ManagedProject[],
): Map<string, string> {
  const latest = new Map<string, string>();
  for (const session of sessions) {
    const key = effectiveProjectPath(session, projects);
    if (!key) continue;
    const prev = latest.get(key);
    if (!prev || session.modified > prev) latest.set(key, session.modified);
  }
  return latest;
}

/** Running/unread session counts per project, for the activity indicators on
 *  project rows. */
export function projectActivityCounts(
  sessions: SessionInfo[],
  runningIds: Iterable<string>,
  unreadIds: Iterable<string>,
  projects: ManagedProject[],
): Map<string, { running: number; unread: number }> {
  const running = new Set(runningIds);
  const unread = new Set(unreadIds);
  const result = new Map<string, { running: number; unread: number }>();
  for (const session of sessions) {
    const key = effectiveProjectPath(session, projects);
    if (!key) continue;
    const current = result.get(key) ?? { running: 0, unread: 0 };
    if (running.has(session.id)) current.running += 1;
    if (unread.has(session.id)) current.unread += 1;
    result.set(key, current);
  }
  return result;
}

/** Sort projects by latest session activity (desc); projects without sessions
 *  follow in most-recently-added (addedAt desc) order. Projects with activity
 *  always rank above projects without. */
export function sortManagedProjects(
  projects: ManagedProject[],
  sessions: SessionInfo[],
): ManagedProject[] {
  const activity = projectActivityByPath(sessions, projects);
  return [...projects].sort((a, b) => {
    const aActivity = activity.get(a.path);
    const bActivity = activity.get(b.path);
    if (aActivity && bActivity) return bActivity.localeCompare(aActivity);
    if (aActivity) return -1;
    if (bActivity) return 1;
    return (b.addedAt ?? "").localeCompare(a.addedAt ?? "");
  });
}

/** Group sessions under their effective project. Every project in `projects`
 *  gets an entry (possibly empty) so empty managed projects render their
 *  empty state. */
export function groupSessionsByProject(
  projects: ManagedProject[],
  sessions: SessionInfo[],
): Map<string, SessionInfo[]> {
  const grouped = new Map<string, SessionInfo[]>();
  for (const project of projects) grouped.set(project.path, []);
  for (const session of sessions) {
    const key = effectiveProjectPath(session, projects);
    if (!key) continue;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(session);
  }
  return grouped;
}

/** Apply a user-controlled manual order (D18). When `orderedPaths` is empty
 *  or null, returns the projects as-is (auto-sort wins). When non-empty,
 *  returns projects in the order they appear in `orderedPaths`, with any
 *  project whose path is missing from the override appended at the end
 *  preserving the input's relative order. */
export function applyManualOrder(
  projects: ManagedProject[],
  orderedPaths: readonly string[] | null,
): ManagedProject[] {
  if (!orderedPaths || orderedPaths.length === 0) return projects;
  const byPath = new Map<string, ManagedProject>();
  for (const project of projects) byPath.set(project.path, project);
  const result: ManagedProject[] = [];
  const seen = new Set<string>();
  for (const path of orderedPaths) {
    const project = byPath.get(path);
    if (!project || seen.has(path)) continue;
    result.push(project);
    seen.add(path);
  }
  for (const project of projects) {
    if (seen.has(project.path)) continue;
    result.push(project);
    seen.add(project.path);
  }
  return result;
}
