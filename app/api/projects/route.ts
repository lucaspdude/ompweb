import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { NextResponse } from "next/server";
import { allowFileRoot } from "@/lib/file-access";
import { CloneRequestError, cloneRepository } from "@/lib/clone-repository";
import { writeProjectMeta } from "@/lib/project-meta";
import {
  comparableProjectPath,
  hideProject,
  loadProjectRegistry,
  ProjectPathError,
  saveProjectRegistry,
  upsertProject,
  validateProjectPath,
} from "@/lib/project-registry";
import { listAllSessions } from "@/lib/session-reader";
import { defaultFolderNameFromUrl } from "@/lib/clone-repository";
import type { ManagedProject } from "@/lib/types";
import { resolveProject } from "@/lib/worktree";

const PROJECT_META_DIRNAME = ".omp";
const PROJECT_META_FILENAME = "project.json";
/** Safety stop for the walk-up auto-discovery (D15); 16 levels is well above
 *  any plausible user nesting while keeping a corrupted symlink loop bounded. */
const WALK_UP_MAX_DEPTH = 16;

/** Absolute path of a project's metadata file. */
function projectMetaPath(projectRoot: string): string {
  // Re-exported for legacy call sites; canonical implementation lives in project-meta.ts.
  // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
  return projectMetaPathImpl(projectRoot);
}
function projectMetaPathImpl(projectRoot: string): string {
  return require("path").join(projectRoot, PROJECT_META_DIRNAME, PROJECT_META_FILENAME);
}

/** Walk up from `startCwd` looking for the first `.omp/project.json` file.
 *  Returns the directory that contains it, or null. */
function findProjectMetaAncestor(startCwd: string): string | null {
  let current = startCwd;
  for (let depth = 0; depth < WALK_UP_MAX_DEPTH; depth++) {
    const candidate = require("path").join(current, PROJECT_META_DIRNAME, PROJECT_META_FILENAME);
    if (existsSync(candidate)) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

/** Decorate a `ManagedProject` with the metadata file's fields. Empty /
 *  default values are dropped so the wire shape stays minimal. */
function annotateProject(project: ManagedProject): ManagedProject {
  const meta = writeProjectMeta(project.path, {});
  const out: ManagedProject = { path: project.path };
  if (project.addedAt !== undefined) out.addedAt = project.addedAt;
  if (meta.name) out.name = meta.name;
  if (meta.description) out.description = meta.description;
  if (meta.archived) out.archived = true;
  if (meta.createdAt) out.createdAt = meta.createdAt;
  if (meta.updatedAt) out.updatedAt = meta.updatedAt;
  if (Object.keys(meta.metadata).length > 0) out.metadata = meta.metadata;
  return out;
}

// GET /api/projects  →  { projects: ManagedProject[] }
//
// Registered (non-hidden) projects plus session-discovered and
// walk-up-auto-discovered ones. Each project is annotated with the
// `.omp/project.json` metadata; projects whose folder is missing on disk are
// filtered out (D16) without mutating the registry; auto-discovered
// `.omp/project.json` ancestors are upserted into the registry on the fly
// with `addedAt` = file mtime (D15).
export async function GET() {
  try {
    const registry = loadProjectRegistry();
    const sessions = await listAllSessions();

    // 1. Walk-up auto-discovery (D15): for each session cwd, walk up looking
    //    for `.omp/project.json`. Only ancestors that contain the file
    //    become projects — raw session cwds do NOT, since they surface
    //    under "Other sessions" via D10.
    const discovered = new Set<string>();
    for (const session of sessions) {
      const cwd = session.projectRoot ?? session.cwd;
      if (!cwd) continue;
      const ancestor = findProjectMetaAncestor(cwd);
      if (ancestor) discovered.add(ancestor);
    }

    // 2. Upsert walk-up ancestors so they survive a reload. addedAt comes
    //    from the metadata file's mtime so the ordering stays stable across
    //    machines that share the same repo.
    let next = registry;
    let dirty = false;
    for (const path of discovered) {
      const exists = next.projects.some(
        (p) => comparableProjectPath(p.path) === comparableProjectPath(path),
      );
      if (exists) continue;
      let addedAt = new Date().toISOString();
      try {
        const stat = require("fs").statSync(
          require("path").join(path, PROJECT_META_DIRNAME, PROJECT_META_FILENAME),
        );
        addedAt = stat.mtime.toISOString();
      } catch {
        // Default to now if stat fails; doesn't matter — this branch only
        // fires for walk-up hits where the file already passed existsSync.
      }
      next = upsertProject(next, path, addedAt);
      dirty = true;
    }
    if (dirty) saveProjectRegistry(next);

    // 3. Return ONLY registered (non-hidden) projects (D9). Session-discovered
    //    dirs whose `.omp/project.json` ancestor was not found by the walk-up
    //    do NOT become projects — their sessions surface under "Other sessions"
    //    in the sidebar via D10 containment.
    const projects = next.projects
      .filter((p) => !p.hidden)
      .filter((p) => existsSync(p.path))
      .map(annotateProject);

    for (const project of projects) allowFileRoot(project.path);
    return NextResponse.json({ projects });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST /api/projects  body: { cwd, name?, description?, gitUrl? }
//                  →  { project: ManagedProject }
//
// Three modes:
//   1. `gitUrl` present  → defer to the clone helper (creates parent/name
//      and `git clone <url>` into it, then writes metadata + registers).
//   2. `cwd` missing      → `mkdir -p cwd` so the create flow can drop a
//      brand-new project folder anywhere the user can write.
//   3. Neither            → existing happy path (cwd already exists; just
//      validate, write metadata, register).
// Idempotent and reviving (D17): re-POST an already-registered cwd with
// `name`/`description` un-hides it, refreshes addedAt, and clears the
// stale `archived` flag so the project lands in the main list.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      cwd?: unknown;
      name?: unknown;
      description?: unknown;
      gitUrl?: unknown;
    };
    const cwd = typeof body.cwd === "string" ? body.cwd.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : undefined;
    const description = typeof body.description === "string" ? body.description.trim() : undefined;
    const gitUrl = typeof body.gitUrl === "string" ? body.gitUrl.trim() : "";

    if (gitUrl) {
      const targetFolder = cwd.split("/").filter(Boolean).pop() ?? defaultFolderNameFromUrl(gitUrl);
      try {
        const result = await cloneRepository({
          url: gitUrl,
          parentPath: cwd ? dirname(cwd) : "",
          folderName: targetFolder,
          description: description ?? "",
          name: name ?? "",
        });
        return NextResponse.json({ project: result.project });
      } catch (error) {
        if (error instanceof CloneRequestError) {
          const status = error.code === "target_exists" ? 409 : 400;
          return NextResponse.json({ error: error.message, code: error.code }, { status });
        }
        throw error;
      }
    }

    if (!existsSync(cwd)) {
      try {
        mkdirSync(cwd, { recursive: true });
      } catch (error) {
        return NextResponse.json(
          { error: `Cannot create folder: ${error instanceof Error ? error.message : String(error)}` },
          { status: 400 },
        );
      }
    }

    const normalized = validateProjectPath(cwd);
    const { projectRoot } = await resolveProject(normalized);

    const partial: { name?: string; description?: string; archived?: boolean } = { archived: false };
    if (name !== undefined) partial.name = name;
    if (description !== undefined) partial.description = description;
    writeProjectMeta(projectRoot, partial);

    const registry = loadProjectRegistry();
    const next = upsertProject(registry, projectRoot);
    saveProjectRegistry(next);
    allowFileRoot(projectRoot);

    const entry = next.projects.find(
      (p) => comparableProjectPath(p.path) === comparableProjectPath(projectRoot),
    );
    if (!entry) {
      return NextResponse.json({ error: "Project registration failed" }, { status: 500 });
    }
    return NextResponse.json({ project: annotateProject({ path: entry.path, addedAt: entry.addedAt }) });
  } catch (error) {
    if (error instanceof ProjectPathError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE /api/projects  body: { cwd }  →  { success: true }
// Hides the project from the sidebar without touching its directory or
// sessions. Re-adding the directory (POST) restores it.
export async function DELETE(req: Request) {
  try {
    const body = (await req.json()) as { cwd?: unknown };
    const cwd = typeof body.cwd === "string" ? body.cwd.trim() : "";
    if (!cwd) {
      return NextResponse.json({ error: "Path is required", code: "path_required" }, { status: 400 });
    }
    const { projectRoot } = await resolveProject(cwd);
    const registry = loadProjectRegistry();
    saveProjectRegistry(hideProject(registry, projectRoot));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PATCH /api/projects  body: { cwd, name?, description?, archived?, metadata? }
//                  →  { project: ManagedProject }
//
// Updates `<cwd>/.omp/project.json` with the supplied fields (D20). The
// folder is immutable — to move a project, DELETE the old path and POST
// the new one. The endpoint refuses to act on hidden entries (unhide them
// first via POST).
export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as {
      cwd?: unknown;
      name?: unknown;
      description?: unknown;
      archived?: unknown;
      metadata?: unknown;
    };
    const cwd = typeof body.cwd === "string" ? body.cwd : "";
    const normalized = validateProjectPath(cwd);
    const { projectRoot } = await resolveProject(normalized);

    const registry = loadProjectRegistry();
    const entry = registry.projects.find(
      (p) => comparableProjectPath(p.path) === comparableProjectPath(projectRoot),
    );
    if (entry && entry.hidden) {
      return NextResponse.json(
        { error: "Project is hidden; POST first to unhide" },
        { status: 409 },
      );
    }

    const partial: {
      name?: string;
      description?: string;
      archived?: boolean;
      metadata?: Record<string, unknown>;
    } = {};
    if (typeof body.name === "string") partial.name = body.name.trim();
    if (typeof body.description === "string") partial.description = body.description.trim();
    if (typeof body.archived === "boolean") partial.archived = body.archived;
    if (
      body.metadata &&
      typeof body.metadata === "object" &&
      !Array.isArray(body.metadata)
    ) {
      partial.metadata = body.metadata as Record<string, unknown>;
    }
    if (Object.keys(partial).length === 0) {
      return NextResponse.json(
        { error: "No fields to update", code: "empty_patch" },
        { status: 400 },
      );
    }
    writeProjectMeta(projectRoot, partial);

    // Refresh `addedAt` so PATCH'd projects bubble up to the top of the
    // auto-sort (parity with POST / D17).
    const next = upsertProject(registry, projectRoot);
    saveProjectRegistry(next);

    return NextResponse.json({ project: annotateProject({ path: projectRoot, addedAt: next.projects.find((p) => comparableProjectPath(p.path) === comparableProjectPath(projectRoot))?.addedAt }) });
  } catch (error) {
    if (error instanceof ProjectPathError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
