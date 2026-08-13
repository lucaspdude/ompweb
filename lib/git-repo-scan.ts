import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { getGitStatus } from "./git-changes";
import type { GitStatusResponse } from "./git-types";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 10_000;
const GIT_MAX_BUFFER = 8 * 1024 * 1024;
const SCAN_MAX_DEPTH = 4;

const IGNORED_DIR_NAMES: Record<string, true> = {
  "node_modules": true,
  ".git": true,
  "target": true,
  "dist": true,
  "build": true,
  ".next": true,
  ".venv": true,
  "__pycache__": true,
  ".cache": true,
  ".turbo": true,
  "coverage": true,
  ".pytest_cache": true,
  ".mypy_cache": true,
  "vendor": true,
  ".DS_Store": true,
};

const SCAN_CACHE_TTL_MS = 5_000;

declare global {
  // eslint-disable-next-line no-var
  var __gitRepoScanCache: { cwd: string; payload: RepositoriesScanResult; expiresAt: number } | undefined;
}

export interface RepositoriesScanResult {
  cwd: string;
  repositories: Array<{
    root: string;
    relativeRoot: string;
    name: string;
    fileCount: number;
    counts: {
      modified: number;
      added: number;
      deleted: number;
      renamed: number;
      untracked: number;
      conflict: number;
    };
    files: GitStatusResponse["files"];
  }>;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER,
    env: { ...process.env, LC_ALL: "C" },
  });
  return stdout;
}

async function confirmRepositoryRoot(dir: string): Promise<string | null> {
  // Cheap stat: only call git rev-parse if .git is present. fs.statSync on
  // .git is a single syscall; the alternative (running git on every dir)
  // would be many times slower.
  try {
    fs.statSync(path.join(dir, ".git"));
  } catch {
    return null;
  }
  try {
    const stdout = await git(dir, ["rev-parse", "--show-toplevel"]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function isWindowsAbsolutePath(target: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(target) || target.startsWith("\\\\") || target.startsWith("//");
}

function toRelative(root: string, cwd: string): string {
  if (process.platform === "win32" || isWindowsAbsolutePath(root) || isWindowsAbsolutePath(cwd)) {
    return path.win32.relative(path.win32.resolve(cwd), path.win32.resolve(root)) || ".";
  }
  return path.relative(path.resolve(cwd), path.resolve(root)) || ".";
}

function aggregateCounts(files: GitStatusResponse["files"]): RepositoriesScanResult["repositories"][number]["counts"] {
  const counts = {
    modified: 0,
    added: 0,
    deleted: 0,
    renamed: 0,
    untracked: 0,
    conflict: 0,
  };
  for (const f of files) {
    switch (f.status) {
      case "modified": counts.modified += 1; break;
      case "added": counts.added += 1; break;
      case "deleted": counts.deleted += 1; break;
      case "renamed": counts.renamed += 1; break;
      case "untracked": counts.untracked += 1; break;
      case "conflict": counts.conflict += 1; break;
    }
  }
  return counts;
}

async function scanTree(cwd: string): Promise<RepositoriesScanResult> {
  const start = path.resolve(cwd);
  const seenRoots = new Set<string>();
  const queue: Array<{ dir: string; depth: number }> = [{ dir: start, depth: 0 }];
  const repositories: RepositoriesScanResult["repositories"] = [];

  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;
    const confirmed = await confirmRepositoryRoot(dir);
    if (confirmed) {
      const canonical = path.resolve(confirmed);
      if (!seenRoots.has(canonical)) {
        seenRoots.add(canonical);
        const status = await getGitStatus(canonical);
        const files = status.files ?? [];
        repositories.push({
          root: canonical,
          relativeRoot: toRelative(canonical, start),
          name: path.basename(canonical) || canonical,
          fileCount: files.length,
          counts: aggregateCounts(files),
          files,
        });
      }
      // Don't descend into a confirmed repo — its subdirs belong to it.
      continue;
    }

    if (depth >= SCAN_MAX_DEPTH) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (IGNORED_DIR_NAMES[entry.name]) continue;
      // Skip dot-dirs after the first level (e.g. .vscode, .idea) to keep scan bounded.
      if (depth > 0 && entry.name.startsWith(".")) continue;
      queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
    }
  }

  return { cwd: start, repositories };
}

export async function scanRepositories(cwd: string): Promise<RepositoriesScanResult> {
  const resolved = path.resolve(cwd);
  const cached = globalThis.__gitRepoScanCache;
  const now = Date.now();
  if (cached && cached.cwd === resolved && cached.expiresAt > now) {
    return cached.payload;
  }
  const payload = await scanTree(resolved);
  globalThis.__gitRepoScanCache = { cwd: resolved, payload, expiresAt: now + SCAN_CACHE_TTL_MS };
  return payload;
}

export function invalidateRepositoryScanCache(cwd?: string) {
  if (!globalThis.__gitRepoScanCache) return;
  if (!cwd || globalThis.__gitRepoScanCache.cwd === path.resolve(cwd)) {
    globalThis.__gitRepoScanCache = undefined;
  }
}
