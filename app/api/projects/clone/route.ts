import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { allowFileRoot } from "@/lib/file-access";
import { writeProjectMeta } from "@/lib/project-meta";
import {
  comparableProjectPath,
  loadProjectRegistry,
  saveProjectRegistry,
  upsertProject,
  validateProjectPath,
} from "@/lib/project-registry";
import type { ManagedProject } from "@/lib/types";

const execFileAsync = promisify(execFile);

const URL_PATTERNS = [
  /^https?:\/\//i,
  /^git:\/\//i,
  /^ssh:\/\//i,
  /^[\w.-]+@[\w.-]+:/,
  /^[\w][\w.-]*\/[\w.-]+$/,
];

function isValidCloneUrl(value: string): boolean {
  return URL_PATTERNS.some((pattern) => pattern.test(value.trim()));
}

function defaultFolderNameFromUrl(url: string): string {
  const trimmed = url.trim().replace(/\.git$/i, "");
  const last = trimmed.split("/").pop() ?? "";
  return last.replace(/[^A-Za-z0-9._-]/g, "-");
}

function annotate(projectRoot: string, addedAt: string): ManagedProject {
  const meta = writeProjectMeta(projectRoot, {}); // read-back
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

// POST /api/projects/clone  body: { url, folderName, parentPath, description? }
//                       →  { project: ManagedProject }
//
// Runs `git clone <url> <parentPath>/<folderName>`, then registers the
// freshly-created folder as a custom project (writes `.omp/project.json` and
// adds it to the registry). `git` must be on the server's PATH.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      url?: unknown;
      folderName?: unknown;
      parentPath?: unknown;
      description?: unknown;
      name?: unknown;
    };
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const folderNameRaw = typeof body.folderName === "string" ? body.folderName.trim() : "";
    const parentPath = typeof body.parentPath === "string" ? body.parentPath.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const providedName = typeof body.name === "string" ? body.name.trim() : "";

    if (!url || !isValidCloneUrl(url)) {
      return NextResponse.json(
        { error: "Invalid git URL", code: "invalid_url" },
        { status: 400 },
      );
    }
    if (!parentPath) {
      return NextResponse.json(
        { error: "Parent folder is required", code: "parent_required" },
        { status: 400 },
      );
    }
    const folderName = folderNameRaw || defaultFolderNameFromUrl(url);
    if (!/^[A-Za-z0-9._-]+$/.test(folderName)) {
      return NextResponse.json(
        { error: "Folder name contains invalid characters", code: "invalid_folder_name" },
        { status: 400 },
      );
    }

    const normalizedParent = validateProjectPath(parentPath);
    if (!existsSync(normalizedParent)) {
      return NextResponse.json(
        { error: `Parent folder does not exist: ${normalizedParent}`, code: "parent_missing" },
        { status: 400 },
      );
    }
    const targetPath = join(normalizedParent, folderName);
    if (existsSync(targetPath)) {
      return NextResponse.json(
        { error: `Target folder already exists: ${targetPath}`, code: "target_exists" },
        { status: 409 },
      );
    }

    try {
      await execFileAsync("git", ["clone", url, targetPath], {
        maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, LC_ALL: "C" },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        { error: `git clone failed: ${detail}`, code: "clone_failed" },
        { status: 500 },
      );
    }

    // Register the new project (mirrors POST /api/projects flow).
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

    return NextResponse.json({
      project: annotate(targetPath, entry?.addedAt ?? new Date().toISOString()),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
