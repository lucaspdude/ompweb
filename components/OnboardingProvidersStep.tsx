"use client";

import { useCallback, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "./ui/button";
import { toast } from "./ui/toast";
import { OnboardingStatus, OnboardingProvider } from "@/hooks/useOnboardingStatus";

interface Props {
  status: OnboardingStatus | null;
  onRefresh: () => Promise<void>;
  onNext: () => void;
  onBack: () => void;
}

const CORE_IDS = ["anthropic", "openai", "google", "openrouter", "mistral", "xai", "github-copilot", "cursor", "azure", "amazon-bedrock"];
const LOCAL_IDS = ["ollama", "lm-studio", "llama.cpp", "vllm"];

function groupProvider(p: OnboardingProvider): "core" | "additional" | "local" | "oauth" {
  if (LOCAL_IDS.includes(p.id)) return "local";
  if (p.auth === "callback") return "oauth";
  if (CORE_IDS.includes(p.id)) return "core";
  return "additional";
}

export function OnboardingProvidersStep({ status, onRefresh, onNext, onBack }: Props) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const providers = status?.providers ?? [];
  const filtered = useMemo(() => {
    if (!search) return providers;
    const q = search.toLowerCase();
    return providers.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
  }, [providers, search]);

  const grouped = useMemo(() => {
    const out: Record<string, OnboardingProvider[]> = { core: [], additional: [], local: [], oauth: [] };
    for (const p of filtered) {
      const g = groupProvider(p);
      (out[g] ?? out.additional).push(p);
    }
    return out;
  }, [filtered]);

  const authenticatedCount = providers.filter((p) => p.authenticated).length;
  const canAdvance = authenticatedCount > 0;

  const handleConnect = useCallback(async (providerId: string) => {
    setBusy(providerId);
    try {
      // For OAuth, redirect to the login route (the backend handles the
      // callback). For API-key, we just navigate to the providers panel.
      if (providerId === "anthropic" || providerId === "github-copilot" || providerId === "cursor") {
        window.open(`/api/auth/login/${providerId}`, "_blank", "noopener,noreferrer");
      } else {
        // API-key flow: open the providers modal in Settings.
        window.dispatchEvent(new CustomEvent("rocinante:open-settings", { detail: { tab: "models" } }));
      }
      toast.info(t("onboarding.providers.connected"));
    } finally {
      setBusy(null);
    }
  }, [t]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: 18, color: "var(--text)" }}>{t("onboarding.providers.title")}</h2>
      <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
        {t("onboarding.providers.subtitle")}
      </p>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("onboarding.providers.search")}
        style={{
          padding: "6px 10px",
          background: "var(--bg)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-control)",
          fontSize: 12,
        }}
      />
      <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {(["core", "additional", "local", "oauth"] as const).map((g) => {
          const list = grouped[g];
          if (!list || list.length === 0) return null;
          return (
            <div key={g}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
                {t(`onboarding.providers.group.${g}`)}
              </div>
              {list.map((p) => (
                <div key={p.id} style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 8px",
                  borderRadius: "var(--radius-control)",
                  background: p.authenticated ? "var(--bg-subtle)" : "transparent",
                }}>
                  <div>
                    <div style={{ fontSize: 13, color: "var(--text)" }}>{p.name}</div>
                    <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>{p.id}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {p.authenticated && (
                      <span style={{ fontSize: 10, color: "var(--status-ok)" }}>{t("onboarding.providers.connected")}</span>
                    )}
                    <Button variant="secondary" onClick={() => handleConnect(p.id)} disabled={busy === p.id || p.authenticated}>
                      {p.authenticated ? "✓" : t("onboarding.omp.detectButton")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", padding: 16 }}>
            {t("onboarding.model.empty")}
          </div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
        <Button variant="secondary" onClick={onBack}>{t("onboarding.common.back")}</Button>
        <Button variant="primary" onClick={onNext} disabled={!canAdvance}>
          {t("onboarding.providers.continueButton", { count: authenticatedCount })}
        </Button>
      </div>
    </div>
  );
}
