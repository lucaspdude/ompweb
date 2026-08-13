// Phase 4 — generic SSH server spec. Reuses lib/ssh/test.ts for the
// connection check (genericEcho mode) and lib/ssh/config.ts for the
// Host block writer.

import { testConnection, type TestResult } from "./test";
import { renderHostBlock, replaceOrAppendBlock, removeBlock } from "./config";
import { configPath } from "./paths";
import type { ServerConnection } from "./types";

export interface ServerSpecInput {
  alias: string;
  hostName: string;
  port: number;
  user: string;
  keyName: string;
  publicKey?: string;
}

export function buildServerBlock(spec: { alias: string; hostName: string; port: number; user: string; keyPath: string }): string {
  const directives: Array<{ key: string; value: string }> = [
    { key: "HostName", value: spec.hostName },
    { key: "User", value: spec.user },
  ];
  if (spec.port !== 22) directives.push({ key: "Port", value: String(spec.port) });
  directives.push({ key: "IdentityFile", value: spec.keyPath });
  directives.push({ key: "IdentitiesOnly", value: "yes" });
  return renderHostBlock(spec.alias, directives);
}

export function writeServerConfig(spec: ServerSpecInput & { keyPath: string }): void {
  const block = buildServerBlock({ alias: spec.alias, hostName: spec.hostName, port: spec.port, user: spec.user, keyPath: spec.keyPath });
  replaceOrAppendBlock(configPath(), `Host ${spec.alias}`, block);
}

export function deleteServerConfig(alias: string): void {
  removeBlock(configPath(), `Host ${alias}`);
}

export function testServerConnection(spec: { alias: string; hostName: string; port: number; user: string; keyPath: string }): Promise<TestResult> {
  const portArg = spec.port === 22 ? [] : ["-p", String(spec.port)];
  return testConnection({
    sshArgs: [...portArg, `${spec.user}@${spec.hostName}`, "echo", "roc-test-ok"],
    identityFile: spec.keyPath,
    genericEcho: true,
  });
}

export function connectionFromSpec(spec: ServerSpecInput & { keyPath: string }): ServerConnection {
  return {
    alias: spec.alias,
    hostName: spec.hostName,
    port: spec.port,
    user: spec.user,
    keyPath: spec.keyPath,
    lastTestAt: null,
    lastTestOk: false,
  };
}
