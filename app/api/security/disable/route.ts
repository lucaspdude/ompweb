import { NextResponse } from "next/server";
import { clearAllRevocations, buildClearCookie } from "@/lib/auth-token";
import { getEnvPath, readEnvFile, writeEnv } from "@/lib/security-store";
import { readFileSync } from "node:fs";

export const dynamic = "force-dynamic";

function readCurrentSecretFromDisk(): string {
  // The .env file is auto-loaded into process.env at startup. The env var is
  // the source of truth for the persisted secret after Next loads the file.
  // On a hot reload the .env may have been written but the process.env is
  // stale; we re-read from disk in that case.
  const path = getEnvPath();
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || trimmed.length === 0) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (key === "ROCINANTE_SECRET" && value.length > 0) return value;
    }
  } catch {
    // fall through to env
  }
  return process.env.ROCINANTE_SECRET ?? "";
}

export async function POST(request: Request) {
  const state = readEnvFile();
  if (!state.hasSecret) {
    return NextResponse.json({ ok: true, enabled: false, envPath: getEnvPath() });
  }
  const secret = readCurrentSecretFromDisk();
  if (secret) {
    writeEnv({ secret, enabled: false });
  }
  clearAllRevocations();
  const https = request.headers.get("x-forwarded-proto") === "https";
  const response = NextResponse.json({ ok: true, enabled: false, envPath: getEnvPath() });
  response.headers.append("Set-Cookie", buildClearCookie(https));
  return response;
}
