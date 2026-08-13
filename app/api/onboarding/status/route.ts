import fs from "fs";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";
import { findOmpBin, getOmpVersion } from "@/lib/rocinante/rocinante-cli";
import { getAgentDir, getSettingsPath, getModelsConfigPath } from "@/lib/omp/paths";
import { runUtilityCommand } from "@/lib/omp/rpc-utility";
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

async function fetchProviders(): Promise<OnboardingStatus["providers"]> {
  try {
    const { providers } = await runUtilityCommand<{ providers: OmpLoginProvider[] }>(
      { type: "get_login_providers" },
      15_000,
    );
    return providers
      .filter((p) => p.available !== false)
      .map((p) => ({
        id: p.id,
        name: p.name,
        auth: oauthKindFor(p.id) === "none" ? "api-key" : oauthKindFor(p.id),
        authenticated: !!p.authenticated,
      }));
  } catch {
    // omp is missing or RPC failed — return empty list. The UI handles
    // this with a "no providers yet" message + the install step.
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
  };

  return NextResponse.json(status);
}
