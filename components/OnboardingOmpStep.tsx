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

export function OnboardingOmpStep({ status, onRefresh, onNext, onBack }: Props) {
  const { t } = useI18n();
  const [installing, setInstalling] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    setLog([]);
    try {
      const res = await fetch("/api/onboarding/install-omp", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.started) {
        toast.info(t("onboarding.omp.alreadyInstalled"));
        await onRefresh();
        return;
      }
      // Subscribe to the SSE stream for log lines.
      const es = new EventSource("/api/onboarding/install-omp/stream");
      es.addEventListener("log", (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          if (data.line) setLog((prev) => [...prev, data.line].slice(-200));
        } catch { /* ignore */ }
      });
      es.addEventListener("done", async (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          if (data.status === "done") {
            toast.success(t("onboarding.omp.installSuccess"));
            await onRefresh();
          } else {
            toast.error(t("onboarding.omp.installFailed", { error: `exit ${data.exitCode}` }));
          }
        } catch { /* ignore */ }
        es.close();
        setInstalling(false);
      });
      es.onerror = () => {
        es.close();
        setInstalling(false);
      };
    } catch (e) {
      toast.error(t("onboarding.omp.installFailed", { error: e instanceof Error ? e.message : String(e) }));
      setInstalling(false);
    }
  }, [t, onRefresh]);

  const installed = !!status?.omp.installed;
  const canAdvance = installed;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ margin: 0, fontSize: 18, color: "var(--text)" }}>{t("onboarding.omp.title")}</h2>
      <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
        {t("onboarding.omp.requiredHint")}
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
            {installed
              ? t("onboarding.omp.installed", { version: status?.omp.version ?? "" })
              : t("onboarding.omp.notInstalled")}
          </div>
          {status?.omp.path && (
            <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
              {status.omp.path}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Button variant="secondary" onClick={onRefresh}>{t("onboarding.omp.detectButton")}</Button>
          {!installed && (
            <Button variant="primary" onClick={handleInstall} disabled={installing}>
              {installing ? t("onboarding.common.installing") : t("onboarding.omp.installButton")}
            </Button>
          )}
        </div>
      </div>
      {log.length > 0 && (
        <pre style={{
          margin: 0,
          padding: 10,
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-control)",
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: "var(--text-muted)",
          maxHeight: 140,
          overflow: "auto",
        }}>
          {log.join("\n")}
        </pre>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
        <Button variant="secondary" onClick={onBack}>{t("onboarding.common.back")}</Button>
        <Button variant="primary" onClick={onNext} disabled={!canAdvance}>{t("onboarding.common.next")}</Button>
      </div>
    </div>
  );
}
