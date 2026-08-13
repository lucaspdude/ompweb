import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { allowFileRoot } from "./file-access";
import { writeProjectMeta, readProjectMeta } from "./project-meta";
import {
  comparableProjectPath,
  loadProjectRegistry,
  saveProjectRegistry,
  upsertProject,
  validateProjectPath,
} from "./project-registry";
import type { ManagedProject } from "./types";

const execFileAsync = promisify(execFile);

const URL_PATTERNS = [
  /^https?:\/\//i,
  /^git:\/\//i,
  /^ssh:\/\//i,
  /^[\w.-]+@[\w.-]+:/,
  /^[\w][\w.-]*\/[\w.-]+$/,
];

export class CloneRequestError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export function defaultFolderNameFromUrl(url: string): string {
  return url.trim().replace(/\.git$/i, "").split("/").pop() ?? "";
}

export function isValidCloneUrl(value: string): boolean {
  return URL_PATTERNS.some((pattern) => pattern.test(value));
}

function annotate(projectRoot: string, addedAt: string): ManagedProject {
  const meta = readProjectMeta(projectRoot);
  return {
    path: projectRoot,
    addedAt,
    ...(meta.name ? { name: meta.name } : {}),
    ...(meta.description ? { description: meta.description } : {}),
    ...(meta.archived ? { archived: true } : {}),
    ...(meta.createdAt ? { createdAt: meta.createdAt } : {}),
    ...(meta.updatedAt ? { updatedAt: meta.updatedAt } : {}),
    ...(Object.keys(meta.metadata).length > 0 ? { metadata: meta.metadata } : {}),
  };
}

export interface CloneRepositoryInput {
  url: string;
  parentPath: string;
  folderName?: string;
  description?: string;
  name?: string;
  /** When provided, a `git init` is run inside a freshly-created (empty)
   *  parentPath/folderName before metadata is written. Used by the create
   *  flow for projects with no upstream remote. */
  initIfEmpty?: boolean;
}

export interface CloneRepositoryResult {
  project: ManagedProject;
  targetPath: string;
}

/** Clone <url> into <parentPath>/<folderName>, write `.omp/project.json`, and
 *  register the result. Throws CloneRequestError with a stable `code` on any
 *  user-visible failure. */
export async function cloneRepository(input: CloneRepositoryInput): Promise<CloneRepositoryResult> {
  const url = input.url.trim();
  const parentPath = input.parentPath.trim();
  const folderNameRaw = input.folderName?.trim() ?? "";
  const description = input.description?.trim() ?? "";
  const providedName = input.name?.trim() ?? "";

  if (!url || !isValidCloneUrl(url)) {
    throw new CloneRequestError("invalid_url", "Invalid git URL");
  }
  if (!parentPath) {
    throw new CloneRequestError("parent_required", "Parent folder is required");
  }

  const normalizedParent = validateProjectPath(parentPath);
  const folderName = folderNameRaw || defaultFolderNameFromUrl(url);
  if (!/^[A-Za-z0-9._-]+$/.test(folderName)) {
    throw new CloneRequestError(
      "invalid_folder_name",
      `Folder name contains invalid characters: ${folderName}`,
    );
  }

  const targetPath = join(normalizedParent, folderName);
  if (existsSync(targetPath)) {
    throw new CloneRequestError(
      "target_exists",
      `Target folder already exists: ${targetPath}`,
    );
  }

  try {
    await execFileAsync("git", ["clone", url, targetPath], {
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, LC_ALL: "C" },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new CloneRequestError("clone_failed", `git clone failed: ${detail}`);
  }

  if (input.initIfEmpty) {
    try {
      await execFileAsync("git", ["init"], { cwd: targetPath });
    } catch (error) {
      throw new CloneRequestError(
        "init_failed",
        `git init failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const projectName = providedName || folderName;
  writeProjectMeta(targetPath, {
    name: projectName,
    ...(description ? { description } : {}),
  });
  const registry = loadProjectRegistry();
  const next = upsertProject(registry, targetPath);
  saveProjectRegistry(next);
  allowFileRoot(targetPath);

  const entry = next.projects.find(
    (p) => comparableProjectPath(p.path) === comparableProjectPath(targetPath),
  );
  return {
    project: annotate(targetPath, entry?.addedAt ?? new Date().toISOString()),
    targetPath,
  };
}
