"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "./ui/button";
import { toast } from "./ui/toast";
import { Dialog, DialogContent, DialogTitle } from "./ui/primitives";
import { OnboardingStatus, OnboardingProvider } from "@/hooks/useOnboardingStatus";

interface Props {
  status: OnboardingStatus | null;
  onRefresh: () => Promise<void>;
}

const CORE_IDS = ["anthropic", "openai", "google", "openrouter", "mistral", "xai", "github-copilot", "cursor", "azure", "amazon-bedrock"];
const LOCAL_IDS = ["ollama", "lm-studio", "llama.cpp", "vllm"];

function groupProvider(p: OnboardingProvider): "core" | "additional" | "local" | "oauth" {
  if (LOCAL_IDS.includes(p.id)) return "local";
  if (p.auth === "callback") return "oauth";
  if (CORE_IDS.includes(p.id)) return "core";
  return "additional";
}

function isLocalProvider(id: string): boolean {
  return LOCAL_IDS.includes(id);
}

function isOAuthProvider(p: OnboardingProvider): boolean {
  // paste-key providers (minimax, zai, kimi-code, …) also go through the
  // browser-driven login popup — omp drives them with extension_ui_request
  // frames and the user pastes a code back, no API-key input modal needed.
  return p.auth === "callback" || p.auth === "paste-key";
}

export function OnboardingProvidersStep({ status, onRefresh }: Props) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  // Sub-modal state: when non-null, shows a small dialog to enter either
  // an API key (for `api-key` providers) or a base URL (for local
  // providers like ollama).
  const [pendingInput, setPendingInput] = useState<{ provider: OnboardingProvider; field: "apiKey" | "baseUrl" } | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);

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

  // Listen for the CustomEvent AppShell dispatches when omp's OAuth flow
  // finishes, so the list refreshes without the user having to click
  // Re-detect. Falls back to a periodic re-detect if the event isn't
  // fired (older omp builds).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onAuthFinished = () => { void onRefresh(); };
    window.addEventListener("rocinante:auth-finished", onAuthFinished);
    return () => window.removeEventListener("rocinante:auth-finished", onAuthFinished);
  }, [onRefresh]);

  const handleConnect = useCallback((provider: OnboardingProvider) => {
    if (isOAuthProvider(provider)) {
      // Real OAuth round-trip via the existing /api/auth/login/{provider}
      // route. Opens in a popup so the main window stays interactive;
      // when the popup closes we re-detect.
      setBusy(provider.id);
      const popup = window.open(
        `/api/auth/login/${provider.id}`,
        `omp-auth-${provider.id}`,
        "width=520,height=640,menubar=no,toolbar=no,location=no,status=no",
      );
      if (!popup) {
        toast.error(t("onboarding.providers.popupBlocked"));
        setBusy(null);
        return;
      }
      // Poll for the popup to close, then refresh.
      const poll = setInterval(() => {
        if (popup.closed) {
          clearInterval(poll);
          setBusy(null);
          void onRefresh();
        }
      }, 500);
    } else {
      // "none" auth providers (raw API key in env or models.yml) AND
      // local providers (Ollama, LM Studio, vLLM) — neither can be
      // configured from the web UI because /api/auth/api-key/{provider}
      // rejects writes by design (omp owns the credential store). The
      // old modal opened an input field and 405'd on save; surface a
      // toast pointing at the real paths (env var, models.yml, /login
      // in terminal) instead.
      toast.error(t("onboarding.providers.keySetOutsideUi", { name: provider.name }));
    }
  }, [t, onRefresh]);

  const handleSaveInput = useCallback(async () => {
    if (!pendingInput) return;
    if (!inputValue.trim()) {
      setInputError(t("onboarding.providers.inputRequired"));
      return;
    }
    setBusy(pendingInput.provider.id);
    try {
      const url = `/api/auth/api-key/${pendingInput.provider.id}` +
        (pendingInput.field === "baseUrl" ? `?baseUrl=${encodeURIComponent(inputValue.trim())}` : "");
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: inputValue.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || `HTTP ${res.status}`);
      }
      toast.success(t("onboarding.providers.apiKeySaved"));
      setPendingInput(null);
      setInputValue("");
      setInputError(null);
      await onRefresh();
    } catch (e) {
      setInputError(t("onboarding.providers.apiKeyFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(null);
    }
  }, [pendingInput, inputValue, t, onRefresh]);

  const renderGroup = (g: "core" | "additional" | "local" | "oauth") => {
    const list = grouped[g];
    if (!list || list.length === 0) return null;
    return (
      <div key={g}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6, marginTop: 4 }}>
          {t(`onboarding.providers.group.${g}`)}
        </div>
        {list.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 10px",
              borderRadius: "var(--radius-control)",
              background: p.authenticated ? "var(--bg-subtle)" : "transparent",
              border: "1px solid var(--border)",
              marginBottom: 4,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{p.name}</div>
              <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>{p.id}</div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {p.authenticated && (
                <span style={{ fontSize: 10, color: "var(--status-ok)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: "var(--status-ok)" }} />
                  {t("onboarding.providers.connected")}
                </span>
              )}
              <Button
                variant={p.authenticated ? "secondary" : "primary"}
                onClick={() => handleConnect(p)}
                disabled={busy === p.id}
              >
                {p.authenticated ? t("onboarding.providers.reconnectAction") : t("onboarding.providers.connectAction")}
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
      <h2 style={{ margin: 0, fontSize: 20, color: "var(--text)" }}>{t("onboarding.providers.title")}</h2>
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
          flexShrink: 0,
        }}
      />
      {providers.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", padding: 24 }}>
          {t("onboarding.providers.noProviders")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
          {(["core", "additional", "local", "oauth"] as const).map(renderGroup)}
        </div>
      )}
      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
        {t("onboarding.providers.moreInSettings")}
      </div>

      {/*
        Sub-modal for collecting an API key or base URL. Renders inside
        the OnboardingModal (uses the existing Dialog primitive so the
        backdrop + escape-key handling match the rest of the app).
       */}
      <Dialog open={pendingInput !== null} onOpenChange={(open) => { if (!open) { setPendingInput(null); setInputError(null); } }}>
        <DialogContent
          ariaLabel={pendingInput ? t(pendingInput.field === "apiKey" ? "onboarding.providers.apiKeyPrompt" : "onboarding.providers.baseUrlPrompt", { name: pendingInput.provider.name }) : ""}
          style={{ width: 460, maxWidth: "min(94vw, 460px)", padding: 22 }}
        >
          <DialogTitle>
            {pendingInput && t(pendingInput.field === "apiKey" ? "onboarding.providers.apiKeyPrompt" : "onboarding.providers.baseUrlPrompt", { name: pendingInput.provider.name })}
          </DialogTitle>
          <div style={{ height: 8 }} />
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--text-muted)" }}>
            {pendingInput?.provider.id}
          </p>
          <input
            type={pendingInput?.field === "apiKey" ? "password" : "text"}
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value); setInputError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") void handleSaveInput(); if (e.key === "Escape") setPendingInput(null); }}
            placeholder={pendingInput?.field === "apiKey" ? t("onboarding.providers.apiKeyPlaceholder") : t("onboarding.providers.baseUrlPlaceholder")}
            autoFocus
            style={{
              width: "100%",
              padding: "6px 10px",
              background: "var(--bg)",
              color: "var(--text)",
              border: inputError ? "1px solid var(--accent)" : "1px solid var(--border)",
              borderRadius: "var(--radius-control)",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
            }}
          />
          {inputError && (
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--accent)" }}>
              {inputError}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
            <Button variant="secondary" onClick={() => { setPendingInput(null); setInputError(null); }}>
              {t("onboarding.providers.apiKeyCancel")}
            </Button>
            <Button variant="primary" onClick={() => void handleSaveInput()} disabled={busy === pendingInput?.provider.id}>
              {t("onboarding.providers.apiKeySave")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
