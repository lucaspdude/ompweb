import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";

// ============================================================================
// Per-project metadata stored at <projectRoot>/.omp/project.json.
//
// Conventions established for the custom-projects sidebar:
//   - File lives in the same `.omp/` directory omp already reads for `mcp.json`
//     and `skills/`, but no name in that directory existed before this feature,
//     so there is no collision.
//   - Reads are lenient: a missing or corrupt file yields an empty meta, never
//     an exception (mirrors parseProjectRegistry in lib/project-registry.ts).
//   - Writes are atomic: temp file in the same directory then rename, so a
//     crash mid-write leaves the previous metadata intact.
//   - The `.omp/` folder is created on demand (mkdirSync recursive). Creating
//     a project never touches git (no `.gitignore`, no `.git/info/exclude`).
// ============================================================================

const PROJECT_META_DIRNAME = ".omp";
const PROJECT_META_FILENAME = "project.json";
const PROJECT_META_VERSION = 1;

export interface ProjectMeta {
  version: 1;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  metadata: Record<string, unknown>;
}

export const EMPTY_PROJECT_META: ProjectMeta = {
  version: 1,
  name: "",
  description: "",
  createdAt: "",
  updatedAt: "",
  archived: false,
  metadata: {},
};

/** Absolute path of a project's metadata file. */
export function projectMetaPath(projectRoot: string): string {
  return join(projectRoot, PROJECT_META_DIRNAME, PROJECT_META_FILENAME);
}

/** Parse a metadata file body. Lenient: missing/corrupt/foreign JSON returns
 *  the empty meta shape so the sidebar never breaks on a bad file. */
export function parseProjectMeta(raw: string): ProjectMeta {
  try {
    const parsed = JSON.parse(raw) as Partial<ProjectMeta> | null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...EMPTY_PROJECT_META };
    }
    return {
      version: 1,
      name: typeof parsed.name === "string" ? parsed.name : "",
      description: typeof parsed.description === "string" ? parsed.description : "",
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      archived: parsed.archived === true,
      metadata:
        parsed.metadata && typeof parsed.metadata === "object" && !Array.isArray(parsed.metadata)
          ? (parsed.metadata as Record<string, unknown>)
          : {},
    };
  } catch {
    return { ...EMPTY_PROJECT_META };
  }
}

/** Read a project's metadata. Missing/corrupt file yields the empty meta. */
export function readProjectMeta(projectRoot: string): ProjectMeta {
  const path = projectMetaPath(projectRoot);
  if (!existsSync(path)) return { ...EMPTY_PROJECT_META };
  try {
    return parseProjectMeta(readFileSync(path, "utf8"));
  } catch {
    return { ...EMPTY_PROJECT_META };
  }
}

/** Write (or merge-update) a project's metadata atomically. Creates the
 *  `.omp/` directory if missing. `createdAt` is stamped on first write and
 *  `updatedAt` is refreshed on every write. Returns the merged meta. */
export function writeProjectMeta(
  projectRoot: string,
  partial: Partial<Omit<ProjectMeta, "version" | "createdAt" | "updatedAt">> = {},
): ProjectMeta {
  const existing = readProjectMeta(projectRoot);
  const now = new Date().toISOString();
  const merged: ProjectMeta = {
    version: 1,
    name: typeof partial.name === "string" ? partial.name : existing.name,
    description:
      typeof partial.description === "string" ? partial.description : existing.description,
    createdAt: existing.createdAt || now,
    updatedAt: now,
    archived: typeof partial.archived === "boolean" ? partial.archived : existing.archived,
    metadata:
      partial.metadata && typeof partial.metadata === "object" && !Array.isArray(partial.metadata)
        ? { ...existing.metadata, ...(partial.metadata as Record<string, unknown>) }
        : existing.metadata,
  };
  const dir = join(projectRoot, PROJECT_META_DIRNAME);
  mkdirSync(dir, { recursive: true });
  const finalPath = join(dir, PROJECT_META_FILENAME);
  const temp = `${finalPath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  renameSync(temp, finalPath);
  return merged;
}
