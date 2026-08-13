import { spawn } from "child_process";
import fs from "fs";
import { NextResponse } from "next/server";
import { findOmpBin } from "@/lib/rocinante/rocinante-cli";
import { getAgentDir } from "@/lib/omp/paths";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Initialise `~/.omp/agent/` via `omp config init-xdg`. Falls back to
 * creating the directory tree manually when `init-xdg` is unavailable
 * (very old omp) or when the dir already exists. */
export async function POST() {
  const bin = findOmpBin();
  if (!bin) {
    return NextResponse.json(
      { error: "omp is not installed. Install it first." },
      { status: 412 },
    );
  }

  const agentDir = getAgentDir();
  if (fs.existsSync(agentDir)) {
    return NextResponse.json({ path: agentDir, alreadyExists: true });
  }

  // Prefer the upstream `omp config init-xdg` when available.
  let initOk = false;
  try {
    const child = spawn(bin, ["config", "init-xdg"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const code: number = await new Promise((resolve) => {
      child.on("exit", (c) => resolve(c ?? 1));
      child.on("error", () => resolve(1));
    });
    initOk = code === 0 && fs.existsSync(agentDir);
  } catch {
    initOk = false;
  }

  if (!initOk) {
    // Manual fallback: create the canonical XDG layout in Unix-style under
    // `~/.omp/agent/`. omp reads from this path regardless of XDG_*.
    fs.mkdirSync(agentDir, { recursive: true });
    fs.mkdirSync(`${agentDir}/sessions`, { recursive: true });
    fs.mkdirSync(`${agentDir}/skills`, { recursive: true });
  }

  return NextResponse.json({ path: agentDir, alreadyExists: false });
}
