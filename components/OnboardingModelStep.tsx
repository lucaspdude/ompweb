"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "./ui/button";
import { toast } from "./ui/toast";
import { OnboardingStatus } from "@/hooks/useOnboardingStatus";

interface Props {
  status: OnboardingStatus | null;
  onRefresh: () => Promise<void>;
}

interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  supportsFastMode?: boolean;
}

interface ModelsPayload {
  models: Record<string, string>;
  modelList: ModelEntry[];
  defaultModel: { provider: string; modelId: string } | null;
}

type ModelRole = "default" | "smol" | "slow";

const ROLE_LABELS: Record<ModelRole, string> = {
  default: "onboarding.model.selectDefault",
  smol: "onboarding.model.selectSmol",
  slow: "onboarding.model.selectSlow",
};

const ROLES: ModelRole[] = ["default", "smol", "slow"];

function formatModelLabel(m: ModelEntry): string {
  return m.name && m.name !== m.id ? `${m.name} (${m.provider}/${m.id})` : `${m.provider}/${m.id}`;
}

function modelKey(m: ModelEntry): string {
  return `${m.provider}:${m.id}`;
}

export function OnboardingModelStep({ status, onRefresh }: Props) {
  const { t } = useI18n();
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [defaultKey, setDefaultKey] = useState<string>("");
  const [smolKey, setSmolKey] = useState<string>("");
  const [slowKey, setSlowKey] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fetch the model registry whenever providers change. The list comes
  // from omp via /api/models (get_available_models) and is already
  // auth-aware — providers the user hasn't connected return no models.
  const loadModels = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/models?cwd=" + encodeURIComponent(status?.agentDir.path ?? ""));
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || `HTTP ${res.status}`);
      }
      const data = await res.json() as ModelsPayload;
      const list = data.modelList ?? [];
      setModels(list);
      // Prefill with the omp-resolved default if we don't already have
      // a user pick for that role. Other roles start empty.
      if (data.defaultModel && !defaultKey) {
        setDefaultKey(`${data.defaultModel.provider}:${data.defaultModel.modelId}`);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [status?.agentDir.path, defaultKey]);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const handleSelect = useCallback((role: ModelRole, key: string) => {
    if (role === "default") setDefaultKey(key);
    if (role === "smol") setSmolKey(key);
    if (role === "slow") setSlowKey(key);
  }, []);

  const handleSave = useCallback(async () => {
    if (!defaultKey) {
      // Step is optional — just advance without saving if no pick.
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/model-roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roles: {
            default: defaultKey,
            smol: smolKey || undefined,
            slow: slowKey || undefined,
          },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || `HTTP ${res.status}`);
      }
      toast.success(t("onboarding.model.saved"));
      await onRefresh();
    } catch (e) {
      toast.error(t("onboarding.model.saveFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  }, [defaultKey, smolKey, slowKey, t, onRefresh]);

  // Per-role pick + unselect (sets to "").
  const renderRolePicker = (role: ModelRole) => {
    const selected = role === "default" ? defaultKey : role === "smol" ? smolKey : slowKey;
    return (
      <div key={role} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {t(ROLE_LABELS[role])}
          </span>
          {selected && (
            <button
              type="button"
              onClick={() => handleSelect(role, "")}
              style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 10, padding: "2px 6px" }}
            >
              {t("onboarding.common.skip")}
            </button>
          )}
        </div>
        {models.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--text-dim)", padding: "6px 10px", background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: "var(--radius-control)" }}>
            {loading ? t("onboarding.common.detecting") : t("onboarding.model.noneAvailable")}
          </div>
        ) : (
          <select
            value={selected}
            onChange={(e) => handleSelect(role, e.target.value)}
            disabled={loading}
            style={{
              padding: "6px 10px",
              background: "var(--bg)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-control)",
              fontSize: 12,
            }}
          >
            <option value="">— {t("onboarding.model.useOmpDefault")} —</option>
            {models.map((m) => {
              const k = modelKey(m);
              return (
                <option key={k} value={k}>
                  {formatModelLabel(m)}
                </option>
              );
            })}
          </select>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
      <h2 style={{ margin: 0, fontSize: 20, color: "var(--text)" }}>{t("onboarding.model.title")}</h2>
      <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
        {t("onboarding.model.subtitle")}
      </p>
      <p style={{ margin: 0, fontSize: 11, color: "var(--text-dim)" }}>{t("onboarding.model.skipHelp")}</p>
      {loadError && (
        <div style={{ fontSize: 11, color: "var(--accent)", padding: "6px 10px", background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: "var(--radius-control)" }}>
          {loadError}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
        {ROLES.map(renderRolePicker)}
      </div>
    </div>
  );
}
