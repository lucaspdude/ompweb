"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Shield } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { copyText } from "@/lib/clipboard";
import { Button } from "./ui/button";
import { toast } from "./ui/toast";

interface EnableResponse {
  secret?: string;
  error?: string;
}

interface Props {
  /** Called when the user advances past this step. */
  onAdvance: () => void;
  /** Called when the user skips. */
  onSkip: () => void;
}

export function OnboardingSecurityStep({ onAdvance, onSkip }: Props) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reflect the current server state on mount so re-opens don't get stuck
  // asking the user to re-enable when the .env already says "true".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/security/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { enabled?: boolean };
        if (!cancelled && data.enabled) setEnabled(true);
      } catch {
        // best-effort; default to "off"
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleEnable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/security/enable", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      const data = (await res.json()) as EnableResponse;
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setEnabled(true);
      if (data.secret) setSecret(data.secret);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const handleCopy = useCallback(async () => {
    if (!secret) return;
    await copyText(secret);
    toast.info(t("onboarding.security.copied"));
  }, [secret, t]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "8px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Shield size={16} aria-hidden="true" />
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{t("onboarding.security.title")}</h2>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{t("onboarding.security.subtitle")}</p>

      {enabled ? (
        <div
          style={{
            padding: 12,
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "var(--bg-panel)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <p style={{ margin: 0, fontSize: 12, color: "var(--text)" }}>{t("onboarding.security.helper")}</p>
          {secret ? (
            <>
              <p style={{ margin: 0, fontSize: 12, color: "var(--text)" }}>{t("onboarding.security.generated")}</p>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <code
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 12,
                    overflow: "auto",
                    background: "var(--bg)",
                    color: "var(--text)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {secret}
                </code>
                <Button variant="ghost" onClick={() => void handleCopy()}>
                  <Copy size={13} aria-hidden="true" /> {t("onboarding.security.copyKey")}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <div
          style={{
            padding: 12,
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "var(--bg-panel)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <p style={{ margin: 0, fontSize: 12, color: "var(--text)" }}>{t("onboarding.security.toggleLabel")}</p>
          <Button variant="primary" onClick={() => void handleEnable()} disabled={busy}>
            <KeyRound size={13} aria-hidden="true" /> {t("onboarding.security.enableAction")}
          </Button>
          {error ? <p role="alert" style={{ margin: 0, fontSize: 12, color: "var(--status-error)" }}>{error}</p> : null}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <Button variant="ghost" onClick={onSkip} disabled={busy}>
          {t("onboarding.security.skipAction")}
        </Button>
        <Button variant="primary" onClick={onAdvance} disabled={busy}>
          {t("common.next")}
        </Button>
      </div>
    </div>
  );
}
