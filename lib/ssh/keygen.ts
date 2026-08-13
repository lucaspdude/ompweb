// ssh-keygen wrapper. The wrapper is deliberately thin — ssh-keygen
// already does the right thing, we just need to:
//
//   1. Pre-check that the target path is free (otherwise ssh-keygen
//      blocks waiting for "Overwrite (y/n)?", which fails in a non-TTY
//      child process).
//   2. chmod 600 the private key after generation so ssh refuses to
//      load it otherwise.
//
// All other files (config, known_hosts) are written via lib/ssh/config.ts
// and lib/ssh/safety.ts.

import { execFile } from "node:child_process";
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { ensureSshDir, sshDir } from "./paths";

const exec = promisify(execFile);

export interface KeyPair {
  privatePath: string;
  publicKey: string;
  publicKeyPath: string;
  comment: string;
}

export async function generateKeyPair({
  name,
  comment,
}: {
  name: string;
  comment: string;
}): Promise<KeyPair> {
  ensureSshDir();
  const privatePath = join(sshDir(), name);
  if (existsSync(privatePath)) {
    throw new Error(`Key already exists at ${privatePath}; pick a different name`);
  }
  await exec("ssh-keygen", [
    "-t", "ed25519",
    "-f", privatePath,
    "-N", "",
    "-C", comment,
    "-q",
  ], { timeout: 15_000 });
  // ssh-keygen is permissive about permissions; enforce 600 here so
  // ssh refuses to load a too-permissive key (which would silently
  // block Test connections).
  try { chmodSync(privatePath, 0o600); } catch { /* Windows */ }
  const publicKeyPath = `${privatePath}.pub`;
  const publicKey = readFileSync(publicKeyPath, "utf8").trim();
  return { privatePath, publicKey, publicKeyPath, comment };
}

/** Derive the public key from a private key via `ssh-keygen -y`. */
export async function derivePublicKey(privatePath: string): Promise<string> {
  const result = await exec("ssh-keygen", ["-y", "-f", privatePath], { timeout: 10_000 });
  return result.stdout.trim();
}
