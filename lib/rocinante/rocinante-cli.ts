/**
 * TypeScript facade for the Rocinante CLI core. Re-exports the CJS core
 * (`./rocinante-cli-core.js`) and adds the async `getOmpVersion` with a
 * short TTL cache that matches the rest of the app's probe pattern.
 *
 * The CJS core exists so the `bin/rocinante.js` launcher can `require()`
 * the omp-probe logic at install time without a TypeScript transpile step.
 * The TS facade preserves type signatures for the rest of the app.
 */
import { execFile } from "child_process";

const core = require("./rocinante-cli-core.js") as {
  BIN_NAME: string;
  ENV_OVERRIDE: string;
  findOmpBin: () => string | null;
  getOmpVersionSync: () => string | null;
  clearCache: () => void;
};

let cachedVersion: string | null = null;
let versionMissAt = 0;
const MISS_TTL_MS = 30_000;

export const BIN_NAME = core.BIN_NAME;
export const ENV_OVERRIDE = core.ENV_OVERRIDE;

export function findOmpBin(): string | null {
  return core.findOmpBin();
}

export function getOmpVersionSync(): string | null {
  return core.getOmpVersionSync();
}

export function clearOmpCliCache(): void {
  core.clearCache();
  cachedVersion = null;
  versionMissAt = 0;
}

/** Async `omp --version` probe. Returns trimmed stdout (e.g. "omp/17.1.3"),
 * or null when the binary is missing or unrunnable. */
export async function getOmpVersion(): Promise<string | null> {
  if (cachedVersion) return cachedVersion;
  if (Date.now() - versionMissAt < MISS_TTL_MS) return null;
  const bin = findOmpBin();
  if (!bin) {
    versionMissAt = Date.now();
    return null;
  }
  try {
    const output = await new Promise<string>((resolve, reject) => {
      execFile(bin, ["--version"], { timeout: 10_000, windowsHide: true }, (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });
    const version = output.trim();
    if (version) {
      cachedVersion = version;
      versionMissAt = 0;
      return version;
    }
  } catch {
    // Fall through to miss path.
  }
  versionMissAt = Date.now();
  return null;
}
