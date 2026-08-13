import { spawn } from "child_process";
import { NextResponse } from "next/server";
import { findOmpBin } from "@/lib/rocinante/rocinante-cli";

export const dynamic = "force-dynamic";
// The omp installer can take 30+ seconds on a slow connection. The POST
// starts the child and returns its pid; the SSE stream route reads from
// the same globalThis-tracked child.
export const maxDuration = 60;

const OMP_INSTALL_URL = "https://omp.sh/install";

interface InstallJob {
  pid: number;
  status: "running" | "done" | "failed";
  lines: string[];
  exitCode: number | null;
  startedAt: number;
  child: ReturnType<typeof spawn>;
}

declare global {
  // eslint-disable-next-line no-var
  var __ompInstallJob: InstallJob | null | undefined;
}

function startInstall(): InstallJob {
  const isWindows = process.platform === "win32";
  const cmd = isWindows ? "powershell.exe" : "bash";
  const args = isWindows
    ? ["-NoProfile", "-Command", `irm ${OMP_INSTALL_URL} | iex`]
    : ["-c", `curl -fsSL ${OMP_INSTALL_URL} | sh`];

  const env = {
    ...process.env,
    PI_INSTALL_DIR: process.env.PI_INSTALL_DIR ?? `${process.env.HOME ?? "/tmp"}/.local/bin`,
  };

  const child = spawn(cmd, args, {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const job: InstallJob = {
    pid: child.pid ?? 0,
    status: "running",
    lines: [],
    exitCode: null,
    startedAt: Date.now(),
    child,
  };

  const onLine = (chunk: Buffer | string) => {
    const text = chunk.toString("utf8");
    for (const line of text.split(/\r?\n/)) {
      if (line) job.lines.push(line);
      if (job.lines.length > 200) job.lines.shift();
    }
  };
  child.stdout?.on("data", onLine);
  child.stderr?.on("data", onLine);

  child.on("exit", (code) => {
    job.exitCode = code;
    job.status = code === 0 ? "done" : "failed";
  });
  child.on("error", (error) => {
    job.lines.push(`[spawn error] ${error.message}`);
    job.status = "failed";
  });

  return job;
}

export async function POST() {
  if (findOmpBin()) {
    return NextResponse.json({ started: false, reason: "omp already installed" });
  }

  // Reset any prior job — the previous attempt failed or the user re-clicked.
  globalThis.__ompInstallJob = null;
  const job = startInstall();
  globalThis.__ompInstallJob = job;

  return NextResponse.json({ started: true, pid: job.pid });
}
