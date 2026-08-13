// Phase 3 — Git SSH keys. State is in-memory (Map keyed by `${provider}:${name}`)
// + reads from ~/.ssh/config to discover existing entries. The same
// `GitKeyEntry` shape is also produced when the user creates a new key.

import { NextResponse } from "next/server";
import { existsSync, readdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import { configPath, ensureSshDir, sshDir } from "@/lib/ssh/paths";
import { generateKeyPair } from "@/lib/ssh/keygen";
import { GIT_PROVIDERS, type GitKeyEntry, type GitProviderId } from "@/lib/ssh/types";
import { deleteKey, keyExists, readPublicKey } from "@/lib/ssh/keys";
import { renderHostBlock, removeBlock } from "@/lib/ssh/config";

export const dynamic = "force-dynamic";

const entries = new Map<string, GitKeyEntry>();

function entryKey(provider: GitProviderId, name: string): string {
  return `${provider}:${name}`;
}

function listExistingFromDisk(): GitKeyEntry[] {
  ensureSshDir();
  const out: GitKeyEntry[] = [];
  if (!existsSync(configPath())) return out;
  const text = readFileSync(configPath(), "utf8");
  // Find `Host <alias>` blocks where the alias matches a known provider's
  // hostAliases. The IdentityFile is parsed from the block.
  const blockRe = /Host (\S+)\n((?:[ \t].*\n?)*)/g;
  let match;
  while ((match = blockRe.exec(text))) {
    const alias = match[1];
    const block = match[2];
    const identityMatch = /IdentityFile\s+(\S+)/.exec(block);
    if (!identityMatch) continue;
    const providerEntry = (Object.entries(GIT_PROVIDERS) as Array<[GitProviderId, typeof GIT_PROVIDERS[GitProviderId]]>).find(([, spec]) => spec.hostAliases.includes(alias));
    if (!providerEntry) continue;
    const [provider, spec] = providerEntry;
    const privatePath = identityMatch[1];
    if (!keyExists(privatePath)) continue;
    out.push({
      provider,
      name: alias,
      keyPath: privatePath,
      publicKey: readPublicKey(`${privatePath}.pub`),
      lastTestAt: null,
      lastTestOk: false,
      accountHint: null,
    });
  }
  return out;
}

function readdirByProvider(): GitKeyEntry[] {
  ensureSshDir();
  const out: GitKeyEntry[] = [];
  for (const file of readdirSync(sshDir())) {
    const m = file.match(/^id_ed25519_(github|gitlab|azureDevops)$/);
    if (!m) continue;
    const provider = m[1] as GitProviderId;
    if (!GIT_PROVIDERS[provider]) continue;
    const keyPath = `${sshDir()}/${file}`;
    if (!keyExists(keyPath)) continue;
    out.push({
      provider,
      name: provider,
      keyPath,
      publicKey: readPublicKey(`${keyPath}.pub`),
      lastTestAt: null,
      lastTestOk: false,
      accountHint: null,
    });
  }
  return out;
}

export async function GET() {
  // Combine the in-memory registry + any keys already on disk (so re-mounts
  // don't lose state). Dedup by provider+name.
  const seen = new Set<string>();
  const all: GitKeyEntry[] = [];
  for (const e of [...entries.values(), ...listExistingFromDisk(), ...readdirByProvider()]) {
    const k = entryKey(e.provider, e.name);
    if (seen.has(k)) continue;
    seen.add(k);
    all.push(e);
  }
  return NextResponse.json({ keys: all });
}

interface AddBody {
  provider?: unknown;
  name?: unknown;
  comment?: unknown;
}

export async function POST(request: Request) {
  let body: AddBody;
  try { body = (await request.json()) as AddBody; } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  if (typeof body.provider !== "string" || !(body.provider in GIT_PROVIDERS)) return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  if (typeof body.name !== "string" || !/^[a-zA-Z0-9_-]{1,32}$/.test(body.name)) {
    return NextResponse.json({ error: "Invalid name (1-32 chars, letters/digits/dash/underscore only)" }, { status: 400 });
  }
  const provider = body.provider as GitProviderId;
  const spec = GIT_PROVIDERS[provider];
  const safeName = body.name;
  const comment = typeof body.comment === "string" ? body.comment : `roc-${provider}-${Math.random().toString(16).slice(2, 8)}`;

  const privateName = `id_ed25519_${safeName.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  let keyPair: { privatePath: string; publicKey: string; publicKeyPath: string; comment: string };
  try {
    keyPair = await generateKeyPair({ name: privateName, comment });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  // Write ~/.ssh/config blocks for every hostAlias the provider uses.
  for (const alias of spec.hostAliases) {
    const block = renderHostBlock(alias, [
      { key: "HostName", value: spec.hostName },
      { key: "User", value: spec.sshTestUser },
      { key: "IdentityFile", value: keyPair.privatePath },
      { key: "IdentitiesOnly", value: "yes" },
    ]);
    const { replaceOrAppendBlock } = await import("@/lib/ssh/config");
    replaceOrAppendBlock(configPath(), `Host ${alias}`, block);
  }

  const entry: GitKeyEntry = {
    provider,
    name: safeName,
    keyPath: keyPair.privatePath,
    publicKey: keyPair.publicKey,
    lastTestAt: null,
    lastTestOk: false,
    accountHint: null,
  };
  entries.set(entryKey(provider, safeName), entry);
  return NextResponse.json({ ok: true, entry });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");
  const name = url.searchParams.get("name");
  if (!provider || !name) return NextResponse.json({ error: "provider + name required" }, { status: 400 });
  if (!(provider in GIT_PROVIDERS)) return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  const p = provider as GitProviderId;
  const spec = GIT_PROVIDERS[p];
  const entry = entries.get(entryKey(p, name));
  if (!entry) {
    // The entry might exist on disk only — re-derive the keyPath.
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const privatePath = `${sshDir()}/id_ed25519_${safeName}`;
    if (!keyExists(privatePath)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    deleteKey(privatePath);
    for (const alias of spec.hostAliases) removeBlock(configPath(), `Host ${alias}`);
    return NextResponse.json({ ok: true });
  }
  deleteKey(entry.keyPath);
  for (const alias of spec.hostAliases) removeBlock(configPath(), `Host ${alias}`);
  entries.delete(entryKey(p, name));
  return NextResponse.json({ ok: true });
}
