import { spawn } from "child_process";
 import { NextRequest } from "next/server";
import { findOmpBin } from "@/lib/rocinante/rocinante-cli";

export const dynamic = "force-dynamic";
// The install can take 30+ seconds. Allow a long-lived SSE connection.
export const maxDuration = 120;

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

export async function GET(request: NextRequest) {
  const job = globalThis.__ompInstallJob;
  if (!job) {
    return new Response(
      "data: " + JSON.stringify({ error: "no install in progress" }) + "\n\n",
      { headers: { "Content-Type": "text/event-stream" } },
    );
  }

  // If the install completed before the client connected, send a final frame.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      // Replay any buffered lines first.
      for (const line of job.lines) send("log", { line });
      send("status", { status: job.status, exitCode: job.exitCode });

      if (job.status !== "running") {
        // Verify whether omp actually became available — the script may have
        // succeeded but installed into a directory not on this process's
        // PATH (e.g. fresh shell). The client uses this to know to refresh.
        send("done", {
          status: job.status,
          exitCode: job.exitCode,
          ompInstalled: !!findOmpBin(),
        });
        controller.close();
        return;
      }

      // Subscribe to future line events by polling job.lines every 250ms.
      // Polling (vs. an EventEmitter) keeps the implementation tiny and the
      // SSE contract simple — a long-lived process can sit at this loop
      // for up to maxDuration seconds.
      const interval = setInterval(() => {
        if (closed) return;
        // Drain any new lines since the last tick.
        // (We approximate by re-emitting the tail; the client deduplicates
        // by line content via the `log` event handler.)
        if (job.lines.length > 0) {
          send("log", { line: job.lines[job.lines.length - 1] });
        }
        if (job.status !== "running") {
          send("done", {
            status: job.status,
            exitCode: job.exitCode,
            ompInstalled: !!findOmpBin(),
          });
          clearInterval(interval);
          closed = true;
          try { controller.close(); } catch { /* already closed */ }
        }
      }, 250);

      // The client may abort the request (close the EventSource). We
      // don't tear down the install — the user might just be navigating
      // away. The job keeps running on globalThis until it exits.
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
