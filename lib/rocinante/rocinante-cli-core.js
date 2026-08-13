"use strict";

/**
 * CJS core for the Rocinante CLI launcher. Lives outside `lib/omp/` so the
 * brand "rocinante" is explicit at the file boundary. Imported directly by
 * `bin/rocinante.js` (no TypeScript transpile required at install time).
 *
 * Responsibilities:
 *   - Locate the user's installed `omp` binary (env override → PATH → common
 *     fallback dirs).
 *   - Probe `omp --version` and surface a friendly install hint when the
 *     binary is missing or unrunnable.
 *
 * Mirrors the sync surface of `lib/omp/omp-cli.ts` (the async bits
 * `getOmpVersion` and the cache TTL live in the TS facade). Kept as a
 * separate file so the Node launcher can `require()` it without TS deps.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const BIN_NAME = process.platform === "win32" ? "omp.exe" : "omp";
const ENV_OVERRIDE = "ROCINANTE_OMP_BIN";
// Inherit the same fallback TTL as the TS probe so a fresh install is picked
// up without restarting the launcher.
const MISS_TTL_MS = 30_000;

let cachedBin = null;
let binMissAt = 0;

function probeOmpBin() {
  const override = process.env[ENV_OVERRIDE];
  if (override) {
    try {
      if (fs.existsSync(override)) return override;
    } catch (_) {
      // Ignore — fall through to PATH lookup.
    }
  }
  const sep = path.delimiter;
  for (const dir of (process.env.PATH || "").split(sep)) {
    if (!dir) continue;
    try {
      const candidate = path.join(dir, BIN_NAME);
      if (fs.existsSync(candidate)) return candidate;
    } catch (_) {
      continue;
    }
  }
  // GUI shells often miss homebrew/bun/.local dirs in PATH; probe the common
  // install locations before giving up.
  const fallbackDirs = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    path.join(os.homedir(), ".bun", "bin"),
    path.join(os.homedir(), ".local", "bin"),
  ];
  for (const dir of fallbackDirs) {
    try {
      const candidate = path.join(dir, BIN_NAME);
      if (fs.existsSync(candidate)) return candidate;
    } catch (_) {
      continue;
    }
  }
  return null;
}

function findOmpBin() {
  if (cachedBin) return cachedBin;
  if (Date.now() - binMissAt < MISS_TTL_MS) return null;
  const found = probeOmpBin();
  if (found) {
    cachedBin = found;
    binMissAt = 0;
    return found;
  }
  binMissAt = Date.now();
  return null;
}

function clearCache() {
  cachedBin = null;
  binMissAt = 0;
}

/** Synchronous `omp --version` probe. Returns trimmed stdout (e.g. "omp/17.1.3")
 * or null when the binary is missing or fails. Used by the launcher to smoke-
 * test after install. */
function getOmpVersionSync() {
  const bin = findOmpBin();
  if (!bin) return null;
  try {
    const out = require("child_process").execFileSync(bin, ["--version"], {
      timeout: 10_000,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    return out.toString().trim() || null;
  } catch (_) {
    return null;
  }
}

module.exports = {
  BIN_NAME,
  ENV_OVERRIDE,
  findOmpBin,
  getOmpVersionSync,
  clearCache,
};
