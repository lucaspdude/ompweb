// Writes "\n" to the login subprocess stdin. `gh` requires this nudge
// to start polling the device-code endpoint; `az` ignores it. The
// caller (UI) fires this after displaying the auth URL + code so the
// user can complete the login in the browser.

import { NextResponse } from "next/server";
import { getJob } from "@/lib/cli-tools/jobs";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string; jobId: string }> }) {
  const { id, jobId } = await context.params;
  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.cliId !== id) {
    return NextResponse.json({ error: "Job does not match this CLI" }, { status: 400 });
  }
  if (job.status !== "running") {
    return NextResponse.json({ error: "Job is not running" }, { status: 409 });
  }
  const stdin = job.child.stdin;
  if (!stdin || stdin.destroyed) {
    return NextResponse.json({ error: "stdin is not writable" }, { status: 500 });
  }
  try {
    stdin.write("\n");
    // We intentionally do NOT close stdin here — gh keeps the channel
    // open in case the polling flow needs more input. The child exits
    // on its own when the user completes or cancels the OAuth flow.
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
