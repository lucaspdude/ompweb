// SSE stream that follows an install job. Mirrors the
// app/api/onboarding/install-omp/stream pattern: 250ms polling, 200-line
// buffer cap, replay-then-tail semantics, request.signal ignored so the
// child process keeps running even if the browser disconnects.

import { NextResponse } from "next/server";
import { getJob, listJobsForCli, removeJob } from "@/lib/cli-tools/jobs";
import type { CliJob } from "@/lib/cli-tools/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  // Reuse the first running install job for this CLI; the POST returned
  // the jobId, but the UI may also poll for the latest.
  const running = listJobsForCli(id as "az" | "gh", "install").find((j) => j.status === "running");
  const job: CliJob | null = running ?? listJobsForCli(id as "az" | "gh", "install").slice(-1)[0] ?? null;
  if (!job) {
    return NextResponse.json({ error: "No install job found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let lastIndex = 0;
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      // Replay buffered lines first.
      for (const line of job.lines) {
        send("log", { line });
        lastIndex++;
      }
      if (job.status !== "running") {
        send("status", { status: job.status, exitCode: job.exitCode });
        controller.close();
        return;
      }
      const interval = setInterval(() => {
        if (closed) return;
        for (let i = lastIndex; i < job.lines.length; i++) {
          send("log", { line: job.lines[i] });
        }
        lastIndex = job.lines.length;
        if (job.status !== "running") {
          send("status", { status: job.status, exitCode: job.exitCode });
          clearInterval(interval);
          closed = true;
          try { controller.close(); } catch { /* ignore */ }
        }
      }, 250);
      // Heartbeat every 30s to keep proxies happy.
      const heartbeat = setInterval(() => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(":\n\n")); } catch { closed = true; }
      }, 30_000);
      // Tear down if the client disconnects.
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        clearInterval(heartbeat);
        closed = true;
        try { controller.close(); } catch { /* ignore */ }
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}

// Convenience: re-export so the test can poke at it.
void getJob;
void removeJob;
