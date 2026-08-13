// Per-server operations: trigger a test (e.g. after the user pastes the
// public key on the remote authorized_keys).

import { NextResponse } from "next/server";
import { testServerConnection } from "@/lib/ssh/server";
import { configPath, sshDir } from "@/lib/ssh/paths";
import { readFileSync, existsSync } from "node:fs";

export const dynamic = "force-dynamic";

function loadSpec(alias: string) {
  if (!existsSync(configPath())) return null;
  const text = readFileSync(configPath(), "utf8");
  const re = new RegExp(`Host ${alias}\\s*\\n((?:[ \\t].*\\n?)*)`, "m");
  const match = re.exec(text);
  if (!match) return null;
  const block = match[1];
  const hostName = /HostName\s+(\S+)/.exec(block)?.[1];
  const user = /User\s+(\S+)/.exec(block)?.[1];
  const portStr = /Port\s+(\S+)/.exec(block)?.[1];
  const identityFile = /IdentityFile\s+(\S+)/.exec(block)?.[1];
  if (!hostName || !user || !identityFile) return null;
  return { alias, hostName, user, port: portStr ? Number(portStr) : 22, keyPath: identityFile };
}

export async function POST(_request: Request, context: { params: Promise<{ alias: string }> }) {
  const { alias } = await context.params;
  const spec = loadSpec(alias);
  if (!spec) return NextResponse.json({ error: "Server not found" }, { status: 404 });
  const result = await testServerConnection(spec);
  return NextResponse.json(result);
}

export async function DELETE(_request: Request, context: { params: Promise<{ alias: string }> }) {
  // Re-export to the parent route by calling into its module-level
  // connections map. The parent route handles disk-only entries too.
  const { alias } = await context.params;
  const spec = loadSpec(alias);
  if (!spec) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { deleteKey } = await import("@/lib/ssh/keys");
  const { deleteServerConfig } = await import("@/lib/ssh/server");
  deleteKey(spec.keyPath);
  deleteServerConfig(alias);
  return NextResponse.json({ ok: true });
}
void sshDir;
