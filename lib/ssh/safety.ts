// File I/O safety. Enforces 700 on ~/.ssh/ and 600 on private keys.
// The ssh binary refuses to load a key with overly-permissive mode,
// so the chmod is mandatory on Unix.

import { chmodSync, realpathSync, readFileSync, statSync } from "node:fs";
import { sshDir } from "./paths";

export function chmod600IfUnix(path: string): void {
  try { chmodSync(path, 0o600); } catch { /* Windows */ }
}

export function chmod700IfUnix(path: string): void {
  try { chmodSync(path, 0o700); } catch { /* Windows */ }
}

export function assertInSshDir(path: string): void {
  const real = realpathSync(path);
  const root = realpathSync(sshDir());
  if (!real.startsWith(root + "/") && real !== root) {
    throw new Error(`Path ${path} is not inside ${root}`);
  }
}

const PRIVATE_KEY_HEADERS = [
  "-----BEGIN OPENSSH PRIVATE KEY-----",
  "-----BEGIN RSA PRIVATE KEY-----",
  "-----BEGIN DSA PRIVATE KEY-----",
  "-----BEGIN EC PRIVATE KEY-----",
];

export function isPrivateKey(path: string): void {
  if (!/id_(ed25519|rsa|dsa|ecdsa)/.test(path)) {
    throw new Error(`Refusing to operate on a non-key file: ${path}`);
  }
  const head = readFileSync(path, { encoding: "utf8" }).split("\n", 1)[0]?.trim() ?? "";
  if (!PRIVATE_KEY_HEADERS.includes(head)) {
    throw new Error(`Not a private key: ${path}`);
  }
  try {
    const mode = statSync(path).mode & 0o777;
    if (process.platform !== "win32" && (mode & 0o077) !== 0) {
      throw new Error(`Key ${path} has overly-permissive mode ${mode.toString(8)}; expected 600`);
    }
  } catch (err) {
    if (err instanceof Error && /ENOENT/.test(err.message)) {
      throw new Error(`Key not found: ${path}`);
    }
    throw err;
  }
}
