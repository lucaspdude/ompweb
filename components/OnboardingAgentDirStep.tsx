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

export function OnboardingAgentDirStep({ status, onRefresh, onNext, onBack }: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  const handleInit = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/onboarding/init-agent", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      toast.success(t("onboarding.agentDir.initSuccess"));
      await onRefresh();
    } catch (e) {
      toast.error(t("onboarding.agentDir.initFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  }, [t, onRefresh]);

  const exists = !!status?.agentDir.exists;
  const canAdvance = exists;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ margin: 0, fontSize: 18, color: "var(--text)" }}>{t("onboarding.agentDir.title")}</h2>
      <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
        {t("onboarding.agentDir.initHint")}
      </p>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 14,
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-control)",
        gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            {exists ? t("onboarding.agentDir.exists") : t("onboarding.agentDir.missing")}
          </div>
          <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
            {status?.agentDir.path}
          </div>
        </div>
        {!exists && (
          <Button variant="primary" onClick={handleInit} disabled={busy}>
            {busy ? t("onboarding.common.detecting") : t("onboarding.agentDir.initButton")}
          </Button>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
        <Button variant="secondary" onClick={onBack}>{t("onboarding.common.back")}</Button>
        <Button variant="primary" onClick={onNext} disabled={!canAdvance}>{t("onboarding.common.next")}</Button>
      </div>
    </div>
  );
}
