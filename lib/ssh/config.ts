// ~/.ssh/config parser + writer. Idempotent: replaceOrAppendBlock finds
// the existing `Host <alias>` block (case-sensitive, with possible
// continuation lines) and rewrites it, or appends a new one. Comments
// outside the block are preserved.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { configPath } from "./paths";

function findBlockBounds(text: string, hostLine: string): { start: number; end: number } | null {
  // Match `^Host <alias>$` (case-sensitive) followed by indented lines
  // (4-space or tab indent) until the next `^Host ` line or end of file.
  const escaped = hostLine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped}\\s*$\\n(?:[ \\t].*\\n?)*`, "m");
  const match = re.exec(text);
  if (!match) return null;
  return { start: match.index, end: match.index + match[0].length };
}

export function replaceOrAppendBlock(sshConfigPath: string, hostLine: string, block: string): void {
  let text = existsSync(sshConfigPath) ? readFileSync(sshConfigPath, "utf8") : "";
  // Ensure a trailing newline.
  if (text.length > 0 && !text.endsWith("\n")) text += "\n";
  const bounds = findBlockBounds(text, hostLine);
  if (bounds) {
    text = text.slice(0, bounds.start) + text.slice(bounds.end);
  }
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trimEnd() + "\n\n" + block + (text.endsWith("\n\n") ? "" : "\n");
  writeFileSync(sshConfigPath, text, { mode: 0o600 });
}

export function removeBlock(sshConfigPath: string, hostLine: string): void {
  if (!existsSync(sshConfigPath)) return;
  const text = readFileSync(sshConfigPath, "utf8");
  const bounds = findBlockBounds(text, hostLine);
  if (!bounds) return;
  const next = text.slice(0, bounds.start) + text.slice(bounds.end);
  writeFileSync(sshConfigPath, next.replace(/\n{3,}/g, "\n\n"), { mode: 0o600 });
}

export function appendBlock(sshConfigPath: string, block: string): void {
  let text = existsSync(sshConfigPath) ? readFileSync(sshConfigPath, "utf8") : "";
  if (text.length > 0 && !text.endsWith("\n")) text += "\n";
  text = text.trimEnd() + "\n\n" + block + "\n";
  writeFileSync(sshConfigPath, text, { mode: 0o600 });
}

export function renderHostBlock(host: string, directives: Array<{ key: string; value: string }>): string {
  const lines = [`Host ${host}`];
  for (const { key, value } of directives) {
    lines.push(`    ${key} ${value}`);
  }
  return lines.join("\n");
}
