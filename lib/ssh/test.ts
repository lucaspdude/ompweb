// Test a connection by spawning `ssh -T -o BatchMode=yes` (or a variant
// for generic servers). The result classifies into one of:
//   - success (ok=true, accountHint may be set)
//   - AUTH_FAILED (permission denied)
//   - HOST_KEY_CHANGED (host key verification failed)
//   - NETWORK (DNS/connect timeout)
//   - SSH_ERROR (anything else)
//
// We avoid buffering huge outputs by capping at 16 KiB; the client only
// needs the first few lines to classify + display the username.

import { spawn } from "node:child_process";
import { configPath } from "./paths";

export type TestClass = "AUTH_FAILED" | "HOST_KEY_CHANGED" | "NETWORK" | "SSH_ERROR" | "OK";

export interface TestResult {
  ok: boolean;
  accountHint: string | null;
  errorClass: TestClass;
  rawStdout: string;
  rawStderr: string;
  exitCode: number | null;
}

const MAX_OUTPUT_BYTES = 16 * 1024;

export interface TestOptions {
  /** Args to append to ssh (e.g. `["git@github.com"]`). */
  sshArgs: string[];
  /** IdentityFile path (-i). */
  identityFile: string;
  /** When true, treats the connection as a generic shell test and
   * expects the server to echo "roc-test-ok". */
  genericEcho?: boolean;
  /** Timeout in ms. */
  timeoutMs?: number;
}

const COMMON_ARGS = (identityFile: string) => [
  "-o", "BatchMode=yes",
  "-o", "ConnectTimeout=10",
  "-o", `IdentityFile=${identityFile}`,
  "-o", "IdentitiesOnly=yes",
  "-o", "StrictHostKeyChecking=accept-new",
  "-o", `UserKnownHostsFile=${configPath()}/../known_hosts`.replace("/config/../", "/"),
];

export function testConnection(opts: TestOptions): Promise<TestResult> {
  return new Promise((resolve) => {
    const args = ["-T", ...COMMON_ARGS(opts.identityFile), ...opts.sshArgs];
    const child = spawn("ssh", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const onChunk = (target: "stdout" | "stderr") => (chunk: Buffer | string) => {
      const text = chunk.toString("utf8");
      if (target === "stdout") {
        stdout = (stdout + text).slice(-MAX_OUTPUT_BYTES);
      } else {
        stderr = (stderr + text).slice(-MAX_OUTPUT_BYTES);
      }
    };
    child.stdout?.on("data", onChunk("stdout"));
    child.stderr?.on("data", onChunk("stderr"));
    const timer = setTimeout(() => {
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
    }, opts.timeoutMs ?? 15_000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      const result = classify({ stdout, stderr, code, genericEcho: opts.genericEcho });
      resolve(result);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, accountHint: null, errorClass: "SSH_ERROR", rawStdout: stdout, rawStderr: err.message, exitCode: null });
    });
  });
}

function classify({ stdout, stderr, code, genericEcho }: { stdout: string; stderr: string; code: number | null; genericEcho?: boolean }): TestResult {
  const out = stdout + stderr;
  if (code === 0) {
    if (genericEcho) {
      const ok = /roc-test-ok/.test(stdout);
      return { ok, accountHint: null, errorClass: ok ? "OK" : "SSH_ERROR", rawStdout: stdout, rawStderr: stderr, exitCode: code };
    }
    return { ok: true, accountHint: extractHi(out), errorClass: "OK", rawStdout: stdout, rawStderr: stderr, exitCode: code };
  }
  if (/Permission denied \(publickey\)/.test(out)) {
    return { ok: false, accountHint: null, errorClass: "AUTH_FAILED", rawStdout: stdout, rawStderr: stderr, exitCode: code };
  }
  if (/Host key verification failed/.test(out)) {
    return { ok: false, accountHint: null, errorClass: "HOST_KEY_CHANGED", rawStdout: stdout, rawStderr: stderr, exitCode: code };
  }
  if (/Could not resolve hostname|Connection timed out|Connection refused|Operation timed out/.test(out)) {
    return { ok: false, accountHint: null, errorClass: "NETWORK", rawStdout: stdout, rawStderr: stderr, exitCode: code };
  }
  return { ok: false, accountHint: null, errorClass: "SSH_ERROR", rawStdout: stdout, rawStderr: stderr, exitCode: code };
}

function extractHi(text: string): string | null {
  const m = text.match(/(?:Hi|Welcome to GitLab, @?)([A-Za-z0-9_.-]+)/);
  return m?.[1] ?? null;
}
