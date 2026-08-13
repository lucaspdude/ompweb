// Login stream — same shape as install/stream but also emits the
// `auth` event when both URL and code have been captured.

import { NextResponse } from "next/server";
import { listJobsForCli } from "@/lib/cli-tools/jobs";
import type { CliJob } from "@/lib/cli-tools/types";

export const dynamic = "force-dynamic";
export const maxDuration = 1800; // 30 min — login can be slow

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const running = listJobsForCli(id as "az" | "gh", "login").find((j) => j.status === "running");
  const job: CliJob | null = running ?? listJobsForCli(id as "az" | "gh", "login").slice(-1)[0] ?? null;
  if (!job) {
    return NextResponse.json({ error: "No login job found" }, { status: 404 });
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
        } catch { closed = true; }
      };
      for (const line of job.lines) {
        send("log", { line });
        lastIndex++;
      }
      if (job.authUrl || job.authCode) {
        send("auth", { url: job.authUrl, code: job.authCode });
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
        if (job.authUrl || job.authCode) {
          send("auth", { url: job.authUrl, code: job.authCode });
          // The auth event is one-shot; we keep sending the latest but
          // the UI uses the first delivery.
        }
        if (job.status !== "running") {
          send("status", { status: job.status, exitCode: job.exitCode });
          clearInterval(interval);
          closed = true;
          try { controller.close(); } catch { /* ignore */ }
        }
      }, 250);
      const heartbeat = setInterval(() => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(":\n\n")); } catch { closed = true; }
      }, 30_000);
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
