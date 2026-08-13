import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { getSpec } from "@/lib/cli-tools/specs";
import { appendLine, createJob, generateJobId, listJobsForCli } from "@/lib/cli-tools/jobs";
import type { CliJob } from "@/lib/cli-tools/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const spec = getSpec(id);
  if (!spec) {
    return NextResponse.json({ error: `Unknown CLI: ${id}` }, { status: 404 });
  }
  const existing = listJobsForCli(spec.id, "install").find((j) => j.status === "running");
  if (existing) {
    return NextResponse.json({ started: false, jobId: existing.id, pid: existing.pid });
  }

  const os = process.platform === "win32" ? "win" : process.platform === "darwin" ? "mac" : "linux";
  const argv = spec.install[os];
  const [cmd, ...args] = argv;
  if (!cmd) {
    return NextResponse.json({ error: `No install recipe for platform: ${os}` }, { status: 500 });
  }

  const jobId = generateJobId(spec.id, "install");
  const child = spawn(cmd, args, {
    env: { ...process.env, BROWSE: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const job: CliJob = {
    id: jobId,
    cliId: spec.id,
    kind: "install",
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

  const onLine = (chunk: Buffer | string) => {
    const text = chunk.toString("utf8");
    for (const line of text.split(/\r?\n/)) {
      if (line) appendLine(jobId, line);
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

  return NextResponse.json({ started: true, jobId, pid: job.pid });
}
