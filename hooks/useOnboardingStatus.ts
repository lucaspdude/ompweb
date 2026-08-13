"use client";

import { useCallback, useEffect, useState } from "react";

export interface OnboardingProvider {
  id: string;
  name: string;
  /** "callback" = real OAuth via a callback server.
   *  "paste-key" = browser-pasted API key.
   *  "api-key" = env-var or models.yml key.
   *  "none" = unknown. */
  auth: "callback" | "paste-key" | "api-key" | "none";
  authenticated: boolean;
}

export interface OnboardingStatus {
  omp: { installed: boolean; version: string | null; path: string | null };
  agentDir: { exists: boolean; path: string };
  configFile: { exists: boolean; hasOnboarded: boolean };
  modelsFile: { exists: boolean; providerCount: number };
  providers: OnboardingProvider[];
  needsOnboarding: boolean;
  lastCompletedStep: number;
}

interface UseOnboardingStatus {
  status: OnboardingStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

let inflight: Promise<OnboardingStatus> | null = null;

async function fetchStatus(step: number): Promise<OnboardingStatus> {
  if (inflight) return inflight;
  inflight = fetch(`/api/onboarding/status?step=${step}`, { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as OnboardingStatus;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useOnboardingStatus(step = 0): UseOnboardingStatus {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await fetchStatus(step);
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [step]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, loading, error, refresh };
}
