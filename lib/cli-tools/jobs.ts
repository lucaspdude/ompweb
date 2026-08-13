// In-memory registry of install + login jobs, scoped per CLI id. Held on
// globalThis so a Next.js hot-reload does not orphan a running subprocess
// or duplicate its child across module instances.

import type { ChildProcess } from "node:child_process";
import type { CliId, CliJob, CliJobKind } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var __cliToolJobs: Map<string, CliJob> | undefined;
}

const jobs: Map<string, CliJob> = globalThis.__cliToolJobs ?? new Map<string, CliJob>();
globalThis.__cliToolJobs = jobs;

const MAX_LINES = 200;

export function createJob(job: CliJob): void {
  jobs.set(job.id, job);
}

export function getJob(id: string): CliJob | null {
  return jobs.get(id) ?? null;
}

export function removeJob(id: string): void {
  const job = jobs.get(id);
  if (job && job.child && !job.child.killed && job.status === "running") {
    try {
      job.child.kill("SIGTERM");
    } catch {
      // already gone
    }
  }
  jobs.delete(id);
}

export function listJobsForCli(cliId: CliId, kind?: CliJobKind): CliJob[] {
  const out: CliJob[] = [];
  for (const job of jobs.values()) {
    if (job.cliId !== cliId) continue;
    if (kind && job.kind !== kind) continue;
    out.push(job);
  }
  return out;
}

export function appendLine(id: string, line: string): void {
  const job = jobs.get(id);
  if (!job) return;
  job.lines.push(line);
  if (job.lines.length > MAX_LINES) job.lines.shift();
}

export function setAuthCapture(id: string, url: string | null, code: string | null): void {
  const job = jobs.get(id);
  if (!job) return;
  if (url) job.authUrl = url;
  if (code) job.authCode = code;
}

export function markExit(id: string, code: number | null): void {
  const job = jobs.get(id);
  if (!job) return;
  job.exitCode = code;
  job.status = code === 0 ? "done" : "failed";
  // Don't auto-remove login jobs — the UI polls them and the spawn
  // child still exists for a brief window. The /status endpoint prunes
  // by age.
}

export function generateJobId(cliId: CliId, kind: CliJobKind): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `${cliId}-${kind}-${ts}-${rand}`;
}

/** Drop jobs older than `maxAgeMs`. Called by the status endpoint to
 * bound memory growth. */
export function pruneOldJobs(maxAgeMs: number): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.status === "running") continue;
    if (now - job.startedAt > maxAgeMs) jobs.delete(id);
  }
}

// Re-export for callers that want to refer to the child type.
export type { ChildProcess };
