import fs from "fs";
import path from "path";

export class FileMutationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "FileMutationError";
  }
}

function assertWithinParent(target: string, parent: string): void {
  const resolved = path.resolve(target);
  const parentResolved = path.resolve(parent);
  if (resolved === parentResolved) {
    throw new FileMutationError("invalid_target", "Target must not be the parent directory itself");
  }
  const rel = path.relative(parentResolved, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new FileMutationError("invalid_target", "Target must remain within the parent directory");
  }
}

/** Create an empty file. Throws if it already exists. */
export function touchFile(target: string): void {
  assertWithinParent(target, path.dirname(target));
  try {
    fs.writeFileSync(target, "", { flag: "wx" });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      throw new FileMutationError("file_exists", "A file already exists at the target path");
    }
    throw error;
  }
}

/** Create a directory. Throws if it already exists. */
export function mkdirFresh(target: string): void {
  assertWithinParent(target, path.dirname(target));
  try {
    fs.mkdirSync(target, { recursive: false });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      throw new FileMutationError("directory_exists", "A directory already exists at the target path");
    }
    throw error;
  }
}

/** Delete a file or (optionally recursive) directory. */
export function removePath(target: string, options: { recursive?: boolean } = {}): void {
  if (!fs.existsSync(target)) {
    throw new FileMutationError("not_found", "No file or directory at that path");
  }
  const stat = fs.lstatSync(target);
  if (stat.isDirectory() && !options.recursive) {
    throw new FileMutationError(
      "directory_not_empty",
      "Directory is not empty; pass recursive=true to remove with contents",
    );
  }
  fs.rmSync(target, { recursive: !!options.recursive, force: false });
}

/** Rename (or move) a path. Both source and destination must be allowed. */
export function renamePath(source: string, destination: string): void {
  assertWithinParent(destination, path.dirname(destination));
  if (fs.existsSync(destination)) {
    throw new FileMutationError("destination_exists", "Destination already exists");
  }
  try {
    fs.renameSync(source, destination);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EXDEV") {
      // Cross-device rename: copy + delete.
      const stat = fs.lstatSync(source);
      if (stat.isDirectory()) {
        copyDirSync(source, destination);
        fs.rmSync(source, { recursive: true, force: true });
      } else {
        fs.copyFileSync(source, destination);
        fs.unlinkSync(source);
      }
      return;
    }
    throw error;
  }
}

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
