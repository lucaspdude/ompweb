import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { getSpec } from "@/lib/cli-tools/specs";
import { appendLine, createJob, generateJobId, listJobsForCli, setAuthCapture } from "@/lib/cli-tools/jobs";
import type { CliJob } from "@/lib/cli-tools/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const spec = getSpec(id);
  if (!spec) {
    return NextResponse.json({ error: `Unknown CLI: ${id}` }, { status: 404 });
  }
  const existing = listJobsForCli(spec.id, "login").find((j) => j.status === "running");
  if (existing) {
    return NextResponse.json({ started: false, jobId: existing.id, pid: existing.pid });
  }
  const [cmd, ...args] = spec.loginCmd;
  if (!cmd) {
    return NextResponse.json({ error: `No login recipe for ${id}` }, { status: 500 });
  }
  const jobId = generateJobId(spec.id, "login");
  const child = spawn(cmd, args, {
    env: { ...process.env, BROWSE: "" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const job: CliJob = {
    id: jobId,
    cliId: spec.id,
    kind: "login",
    pid: child.pid ?? 0,
    status: "running",
    lines: [],
    startedAt: Date.now(),
    exitCode: null,
    authUrl: null,
    authCode: null,
    child,
  };
  createJob(job);

  let urlMatched = false;
  let codeMatched = false;
  const onLine = (chunk: Buffer | string) => {
    const text = chunk.toString("utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      appendLine(jobId, line);
      if (!urlMatched) {
        const match = spec.loginUrlRegex.exec(line);
        if (match) {
          setAuthCapture(jobId, match[1], null);
          urlMatched = true;
        }
      }
      if (!codeMatched) {
        const match = spec.loginCodeRegex.exec(line);
        if (match) {
          setAuthCapture(jobId, null, match[1]);
          codeMatched = true;
        }
      }
    }
  };
  child.stdout?.on("data", onLine);
  child.stderr?.on("data", onLine);

  child.on("exit", (code) => {
    job.exitCode = code;
    job.status = code === 0 ? "done" : "failed";
  });
  child.on("error", (error) => {
    appendLine(jobId, `[spawn error] ${error.message}`);
    job.status = "failed";
  });

  setTimeout(() => {
    if (job.status === "running") {
      appendLine(jobId, "[timeout] login flow exceeded the device-code TTL");
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
      job.status = "failed";
    }
  }, spec.loginTimeoutSeconds * 1000);

  return NextResponse.json({ started: true, jobId, pid: job.pid });
}
