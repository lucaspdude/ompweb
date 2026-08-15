import fs from "fs";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";
import { isAuthEnabled } from "@/lib/auth-token";
import { findOmpBin, getOmpVersion } from "@/lib/rocinante/rocinante-cli";
import { getAgentDir, getSettingsPath, getModelsConfigPath } from "@/lib/omp/paths";
import { runUtilityCommand, runIsolatedUtilityCommand } from "@/lib/omp/rpc-utility";
import type { OmpLoginProvider } from "@/lib/omp/rpc-utility";
import { oauthKindFor } from "@/lib/omp/oauth-providers";

export const dynamic = "force-dynamic";

interface OnboardingStatus {
  omp: {
    installed: boolean;
    version: string | null;
    path: string | null;
  };
  agentDir: {
    exists: boolean;
    path: string;
  };
  configFile: {
    exists: boolean;
    hasOnboarded: boolean;
  };
  modelsFile: {
    exists: boolean;
    providerCount: number;
  };
  providers: Array<{
    id: string;
    name: string;
    auth: "callback" | "paste-key" | "api-key" | "none";
    authenticated: boolean;
  }>;
  needsOnboarding: boolean;
  securityEnabled: boolean;
  lastCompletedStep: number;
}

function hasOnboardedHeuristic(configPath: string): boolean {
  // Heuristic: a user is "onboarded" when config.yml has any non-default key
  // (provider / modelRoles / etc.) or models.yml exists with at least one
  // provider block. This is a best-effort signal — the upstream omp has no
  // explicit "onboarded" flag.
  if (fs.existsSync(configPath)) {
    try {
      const text = fs.readFileSync(configPath, "utf8");
      if (/^\s*(provider|modelRoles|defaultModel)/m.test(text)) {
        return true;
      }
    } catch {
      // ignore
    }
  }
  return false;
}

function countProvidersInModelsFile(modelsPath: string): number {
  if (!fs.existsSync(modelsPath)) return 0;
  try {
    const text = fs.readFileSync(modelsPath, "utf8");
    // Each provider block starts at column 0 with a key like "  anthropic:".
    // We don't fully parse YAML — a regex counting top-level keys is good
    // enough for the badge count.
    const matches = text.match(/^[a-zA-Z][\w-]*\s*:/gm) ?? [];
    return matches.length;
  } catch {
    return 0;
  }
}

/** Pick the first provider API key env var the user has NOT set, and
 * return a fresh random dummy value for it. We pass that env var into
 * the omp child process so omp sees *some* key, enters RPC mode, and
 * answers `get_login_providers` — without it, omp exits with "No
 * models available" before responding to anything. The dummy value is
 * never authenticated (a 401 from the real provider sets every
 * provider's `authenticated=false`) and it lives only inside the omp
 * subprocess env; we never write to process.env. Order matches omp's
 * provider-lookup priority. */
const DUMMY_BOOTSTRAP_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
] as const;

function pickBootstrapKeyEnv(): Record<string, string> {
  for (const name of DUMMY_BOOTSTRAP_KEYS) {
    if (!process.env[name]) return { [name]: `sk-bootstrap-${Math.random().toString(36).slice(2)}` };
  }
  return {};
}

async function fetchProviders(): Promise<OnboardingStatus["providers"]> {
  // Seed omp with a dummy API key when none of the well-known keys are
  // set — otherwise the onboarding flow is stuck at "no providers"
  // which is the very step meant to configure one.
  const bootstrapEnv = pickBootstrapKeyEnv();
  try {
    const { providers } = await runIsolatedUtilityCommand<{ providers: OmpLoginProvider[] }>(
      { type: "get_login_providers" },
      { env: bootstrapEnv, timeoutMs: 15_000 },
    );
    return providers
      .filter((p) => p.available !== false)
      .map((p) => ({
        id: p.id,
        name: p.name,
        auth: oauthKindFor(p.id),
        authenticated: !!p.authenticated,
      }));
  } catch {
    // omp missing or RPC still failed even with a dummy key — return
    // an empty list. The UI shows the "configure one in Settings"
    // hint as a last resort.
    return [];
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lastCompletedStep = Number(url.searchParams.get("step") ?? "0") || 0;

  const ompBin = findOmpBin();
  const version = ompBin ? await getOmpVersion().catch(() => null) : null;
  const agentDir = getAgentDir();
  const configPath = getSettingsPath();
  const modelsPath = getModelsConfigPath();

  const agentDirExists = fs.existsSync(agentDir);
  const providers = await fetchProviders();
  const authenticatedCount = providers.filter((p) => p.authenticated).length;

  const status: OnboardingStatus = {
    omp: {
      installed: !!ompBin,
      version: version ?? null,
      path: ompBin,
    },
    agentDir: {
      exists: agentDirExists,
      path: agentDir,
    },
    configFile: {
      exists: fs.existsSync(configPath),
      hasOnboarded: hasOnboardedHeuristic(configPath),
    },
    modelsFile: {
      exists: fs.existsSync(modelsPath),
      providerCount: countProvidersInModelsFile(modelsPath),
    },
    providers,
    needsOnboarding: !!(
      !ompBin
      || !agentDirExists
      || (providers.length > 0 && authenticatedCount === 0)
    ),
    lastCompletedStep,
    securityEnabled: isAuthEnabled(),
  };

  return NextResponse.json(status);
}
