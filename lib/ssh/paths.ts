// Filesystem paths for the SSH feature. All paths live under ~/.ssh/
// (resolved to a realpath). Per the feature doc D11 we create the
// directory at 700 if it doesn't exist.

import { existsSync, mkdirSync } from "node:fs";
import { homedir as osHomedir } from "node:os";
import { join, resolve } from "node:path";

export const SSH_DIR = resolve(osHomedir(), ".ssh");
const KEY_NAME_PREFIX = "id_ed25519_";

export function sshDir(): string {
  return SSH_DIR;
}

export function configPath(): string {
  return join(SSH_DIR, "config");
}

export function knownHostsPath(): string {
  return join(SSH_DIR, "known_hosts");
}

/** Compute the on-disk path for a key with a given display name. Returns
 * the first non-colliding `id_ed25519_<name>`, `id_ed25519_<name>_2`, etc. */
export function getKeyPath(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, "_");
  const base = `${KEY_NAME_PREFIX}${safe}`;
  if (!existsSync(join(SSH_DIR, base))) return join(SSH_DIR, base);
  for (let i = 2; i < 1000; i++) {
    const candidate = join(SSH_DIR, `${base}_${i}`);
    if (!existsSync(candidate)) return candidate;
  }
  throw new Error(`Could not find a non-colliding key name for "${name}"`);
}

export function ensureSshDir(): void {
  if (!existsSync(SSH_DIR)) {
    mkdirSync(SSH_DIR, { recursive: true, mode: 0o700 });
  }
}
