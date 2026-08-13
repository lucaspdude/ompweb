"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "./ui/button";
import { toast } from "./ui/toast";
import { OnboardingStatus } from "@/hooks/useOnboardingStatus";

interface Props {
  status: OnboardingStatus | null;
  onRefresh: () => Promise<void>;
  onNext: () => void;
  onBack: () => void;
}

export function OnboardingModelStep({ status, onRefresh, onNext, onBack }: Props) {
  const { t } = useI18n();
  const [defaultModel, setDefaultModel] = useState("");
  const [smolModel, setSmolModel] = useState("");
  const [slowModel, setSlowModel] = useState("");
  const [busy, setBusy] = useState(false);

  // Pull a sensible default from the first authenticated provider if the
  // user hasn't typed anything yet.
  const placeholder = (providerHint: string) => providerHint;

  const handleSave = useCallback(async () => {
    if (!defaultModel) return; // step is optional per D3
    setBusy(true);
    try {
      const res = await fetch("/api/model-roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: { default: defaultModel, smol: smolModel || undefined, slow: slowModel || undefined } }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      toast.success(t("onboarding.done.title"));
      await onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [defaultModel, smolModel, slowModel, t, onRefresh]);

  // Suggest the first authenticated provider as a model prefix.
  const firstProvider = status?.providers.find((p) => p.authenticated);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: 18, color: "var(--text)" }}>{t("onboarding.model.title")}</h2>
      <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
        {t("onboarding.model.subtitle")}
      </p>
      <p style={{ margin: 0, fontSize: 11, color: "var(--text-dim)" }}>{t("onboarding.model.skipHint")}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>{t("onboarding.model.defaultLabel")}</span>
          <input
            type="text"
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            placeholder={firstProvider ? placeholder(firstProvider.id) : "provider/model-name"}
            style={{ padding: "6px 10px", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--radius-control)", fontSize: 12 }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>{t("onboarding.model.smolLabel")}</span>
          <input
            type="text"
            value={smolModel}
            onChange={(e) => setSmolModel(e.target.value)}
            placeholder={firstProvider ? placeholder(firstProvider.id) : "provider/model-name"}
            style={{ padding: "6px 10px", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--radius-control)", fontSize: 12 }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>{t("onboarding.model.slowLabel")}</span>
          <input
            type="text"
            value={slowModel}
            onChange={(e) => setSlowModel(e.target.value)}
            placeholder={firstProvider ? placeholder(firstProvider.id) : "provider/model-name"}
            style={{ padding: "6px 10px", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--radius-control)", fontSize: 12 }}
          />
        </label>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
        <Button variant="secondary" onClick={onBack}>{t("onboarding.common.back")}</Button>
        <div style={{ display: "flex", gap: 6 }}>
          <Button variant="secondary" onClick={onNext}>{t("onboarding.common.skip")}</Button>
          <Button variant="primary" onClick={handleSave} disabled={busy || !defaultModel}>
            {t("onboarding.common.next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
