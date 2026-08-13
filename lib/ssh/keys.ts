// Key file I/O. The private key is always written with mode 600
// (chmodSync is a no-op on Windows). The public key is read on demand
// for the UI to display.

import { chmodSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

export function readPrivateKey(path: string): string {
  return readFileSync(path, "utf8");
}

export function readPublicKey(publicPath: string): string {
  return readFileSync(publicPath, "utf8").trim();
}

export function writePrivateKey(path: string, content: string): void {
  writeFileSync(path, content, { mode: 0o600 });
  try { chmodSync(path, 0o600); } catch { /* Windows */ }
}

export function deleteKey(privatePath: string): void {
  const pub = `${privatePath}.pub`;
  if (existsSync(privatePath)) unlinkSync(privatePath);
  if (existsSync(pub)) unlinkSync(pub);
}

export function keyExists(privatePath: string): boolean {
  return existsSync(privatePath) && existsSync(`${privatePath}.pub`);
}
