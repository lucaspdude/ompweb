// Per-provider operations: test the connection (returns success /
// error class) and read the public key for the user to paste on the
// provider's website.

import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "node:fs";
import { configPath, ensureSshDir, sshDir } from "@/lib/ssh/paths";
import { testConnection } from "@/lib/ssh/test";
import { GIT_PROVIDERS, type GitProviderId } from "@/lib/ssh/types";
import { keyExists, readPublicKey } from "@/lib/ssh/keys";

export const dynamic = "force-dynamic";

function findKeyForProvider(provider: GitProviderId): { privatePath: string; publicKey: string } | null {
  ensureSshDir();
  if (!existsSync(configPath())) return null;
  const text = readFileSync(configPath(), "utf8");
  const spec = GIT_PROVIDERS[provider];
  for (const alias of spec.hostAliases) {
    const re = new RegExp(`Host ${alias}\\s*\\n(?:[ \\t].*\\n?)*`, "m");
    const match = re.exec(text);
    if (!match) continue;
    const idMatch = /IdentityFile\s+(\S+)/.exec(match[0]);
    if (!idMatch) continue;
    const privatePath = idMatch[1];
    if (!keyExists(privatePath)) continue;
    return { privatePath, publicKey: readPublicKey(`${privatePath}.pub`) };
  }
  return null;
}

export async function GET(_request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  if (!(provider in GIT_PROVIDERS)) return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  const p = provider as GitProviderId;
  const found = findKeyForProvider(p);
  if (!found) return NextResponse.json({ exists: false });
  return NextResponse.json({ exists: true, keyPath: found.privatePath, publicKey: found.publicKey, publicKeyUrl: GIT_PROVIDERS[p].publicKeyUrl });
}

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  if (!(provider in GIT_PROVIDERS)) return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  const p = provider as GitProviderId;
  const spec = GIT_PROVIDERS[p];
  const found = findKeyForProvider(p);
  if (!found) return NextResponse.json({ error: "No key for this provider" }, { status: 404 });
  const result = await testConnection({
    sshArgs: [`${spec.sshTestUser}@${spec.hostName}`],
    identityFile: found.privatePath,
  });
  return NextResponse.json(result);
}
