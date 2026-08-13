// Per-CLI status endpoint. Detects install + auth by running cheap
// subprocesses (`az --version`, `az account show`, etc.) and surfaces
// the result to the UI. The 10s timeout is generous; most of these
// commands complete in under a second on a healthy network.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { getSpec } from "@/lib/cli-tools/specs";
import { pruneOldJobs, listJobsForCli } from "@/lib/cli-tools/jobs";
import type { CliStatus } from "@/lib/cli-tools/types";

const exec = promisify(execFile);

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 10_000;

async function detectStatus(spec: ReturnType<typeof getSpec>): Promise<CliStatus> {
  if (!spec) {
    return { installed: false, authenticated: false, version: null, accountHint: null, detail: null };
  }
  let installed = false;
  let version: string | null = null;
  let detail: string | null = null;
  try {
    const result = await exec(spec.verifyInstall[0], spec.verifyInstall.slice(1), { timeout: TIMEOUT_MS });
    installed = true;
    version = (result.stdout || result.stderr).split("\n")[0]?.trim() || null;
  } catch (err) {
    detail = err instanceof Error ? err.message : String(err);
    return { installed: false, authenticated: false, version: null, accountHint: null, detail };
  }
  let authenticated = false;
  let accountHint: string | null = null;
  try {
    const authResult = await exec(spec.verifyAuth[0], spec.verifyAuth.slice(1), { timeout: TIMEOUT_MS });
    authenticated = true;
    detail = (authResult.stdout || authResult.stderr).split("\n").slice(0, 5).join("\n");
    if (authenticated) {
      try {
        const accountResult = await exec(spec.accountQuery[0], spec.accountQuery.slice(1), { timeout: TIMEOUT_MS });
        accountHint = accountResult.stdout.trim() || null;
      } catch {
        // Account query failed (network etc) — keep authenticated=true but no hint.
      }
    }
  } catch (err) {
    detail = err instanceof Error ? err.message : String(err);
  }
  return { installed, authenticated, version, accountHint, detail };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const spec = getSpec(id);
  if (!spec) {
    return NextResponse.json({ error: `Unknown CLI: ${id}` }, { status: 404 });
  }
  pruneOldJobs(5 * 60_000);
  const status = await detectStatus(spec);
  const runningJobs = listJobsForCli(spec.id).filter((j) => j.status === "running");
  return NextResponse.json({ ...status, runningJobs: runningJobs.map((j) => ({ id: j.id, kind: j.kind, pid: j.pid })) });
}
