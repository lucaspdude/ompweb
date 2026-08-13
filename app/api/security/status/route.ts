import { NextResponse } from "next/server";
import { getEnvPath, readEnvFile } from "@/lib/security-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = readEnvFile();
    return NextResponse.json({ enabled: state.enabled, hasSecret: state.hasSecret, envPath: getEnvPath() });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
