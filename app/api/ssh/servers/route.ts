// Phase 4 — generic SSH server connections. State is in-memory
// (Map<alias, ServerConnection>) seeded from ~/.ssh/config blocks that
// look like single-alias Host blocks (no `Host *` patterns).

import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { configPath, ensureSshDir, sshDir } from "@/lib/ssh/paths";
import { generateKeyPair } from "@/lib/ssh/keygen";
import { deleteKey, keyExists } from "@/lib/ssh/keys";
import { writeServerConfig, deleteServerConfig, testServerConnection } from "@/lib/ssh/server";
import type { ServerConnection } from "@/lib/ssh/types";

export const dynamic = "force-dynamic";

const connections = new Map<string, ServerConnection>();

function loadFromDisk(): ServerConnection[] {
  ensureSshDir();
  if (!existsSync(configPath())) return [];
  const text = readFileSync(configPath(), "utf8");
  const out: ServerConnection[] = [];
  const blockRe = /Host ([A-Za-z0-9][A-Za-z0-9_-]{0,31})\n((?:[ \t].*\n?)*)/g;
  let match;
  while ((match = blockRe.exec(text))) {
    const alias = match[1];
    const block = match[2];
    if (["github.com", "gitlab.com", "dev.azure.com", "vs-ssh.visualstudio.com", "ssh.dev.azure.com"].includes(alias)) continue;
    const hostName = /HostName\s+(\S+)/.exec(block)?.[1];
    const user = /User\s+(\S+)/.exec(block)?.[1];
    const portStr = /Port\s+(\S+)/.exec(block)?.[1];
    const identityFile = /IdentityFile\s+(\S+)/.exec(block)?.[1];
    if (!hostName || !user || !identityFile) continue;
    if (!keyExists(identityFile)) continue;
    out.push({
      alias,
      hostName,
      user,
      port: portStr ? Number(portStr) : 22,
      keyPath: identityFile,
      lastTestAt: null,
      lastTestOk: false,
    });
  }
  return out;
}

export async function GET() {
  const seen = new Set<string>();
  const all: ServerConnection[] = [];
  for (const c of [...connections.values(), ...loadFromDisk()]) {
    if (seen.has(c.alias)) continue;
    seen.add(c.alias);
    all.push(c);
  }
  return NextResponse.json({ servers: all });
}

interface AddBody {
  alias?: unknown;
  hostName?: unknown;
  port?: unknown;
  user?: unknown;
  publicKey?: unknown;
}

export async function POST(request: Request) {
  let body: AddBody;
  try { body = (await request.json()) as AddBody; } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  if (typeof body.alias !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(body.alias)) {
    return NextResponse.json({ error: "Invalid alias (1-32 chars, must start with letter/digit)" }, { status: 400 });
  }
  if (typeof body.hostName !== "string" || body.hostName.length === 0) return NextResponse.json({ error: "hostName required" }, { status: 400 });
  if (typeof body.user !== "string" || body.user.length === 0) return NextResponse.json({ error: "user required" }, { status: 400 });
  const port = typeof body.port === "number" && body.port > 0 ? body.port : 22;
  const safeName = body.alias.replace(/[^a-zA-Z0-9_-]/g, "_");
  const privateName = `id_ed25519_${safeName}`;
  let keyPair: { privatePath: string; publicKey: string; publicKeyPath: string; comment: string };
  try {
    keyPair = await generateKeyPair({ name: privateName, comment: `roc-server-${body.alias}-${Math.random().toString(16).slice(2, 8)}` });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  writeServerConfig({
    alias: body.alias,
    hostName: body.hostName,
    port,
    user: body.user,
    keyName: privateName,
    keyPath: keyPair.privatePath,
  });
  const conn: ServerConnection = {
    alias: body.alias,
    hostName: body.hostName,
    port,
    user: body.user,
    keyPath: keyPair.privatePath,
    lastTestAt: Date.now(),
    lastTestOk: true,
  };
  connections.set(body.alias, conn);
  return NextResponse.json({ ok: true, server: conn, publicKey: keyPair.publicKey });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const alias = url.searchParams.get("alias");
  if (!alias) return NextResponse.json({ error: "alias required" }, { status: 400 });
  const conn = connections.get(alias);
  if (conn) {
    deleteKey(conn.keyPath);
    deleteServerConfig(alias);
    connections.delete(alias);
  } else {
    const found = loadFromDisk().find((c) => c.alias === alias);
    if (found) {
      deleteKey(found.keyPath);
      deleteServerConfig(alias);
    } else {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }
  return NextResponse.json({ ok: true });
}
void sshDir;
