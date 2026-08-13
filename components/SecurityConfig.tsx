"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, RefreshCw, Shield, ShieldOff } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { copyText } from "@/lib/clipboard";
import { toast } from "./ui/toast";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle } from "./ui/primitives";

interface SecurityStatus {
  enabled: boolean;
  hasSecret: boolean;
  envPath: string;
}

interface ActiveSession {
  jti: string;
  sub: string;
  iat: number;
  exp: number;
  ip: string | null;
  userAgent: string | null;
}

function formatTimestamp(unix: number): string {
  if (!Number.isFinite(unix)) return "—";
  return new Date(unix * 1000).toISOString().replace("T", " ").replace(/\..*$/, " UTC");
}

export function SecurityConfig() {
  const { t } = useI18n();
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [statusRes, sessionsRes] = await Promise.all([
        fetch("/api/security/status", { cache: "no-store" }),
        fetch("/api/security/sessions", { cache: "no-store" }),
      ]);
      const statusJson = (await statusRes.json()) as SecurityStatus;
      const sessionsJson = sessionsRes.ok ? ((await sessionsRes.json()) as { sessions: ActiveSession[] }) : { sessions: [] };
      setStatus(statusJson);
      setSessions(sessionsJson.sessions ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleEnable = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/security/enable", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      const data = (await res.json()) as { secret?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.secret) setGeneratedSecret(data.secret);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const handleDisable = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/security/disable", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setGeneratedSecret(null);
      setConfirmDisableOpen(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const handleRotate = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/security/rotate", { method: "POST" });
      const data = (await res.json()) as { secret?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.secret) setGeneratedSecret(data.secret);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const handleRevoke = useCallback(async (jti: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/security/sessions", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ jti }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const handleCopySecret = useCallback(async () => {
    if (!generatedSecret) return;
    await copyText(generatedSecret);
    toast.info(t("onboarding.security.copied"));
  }, [generatedSecret, t]);

  if (loading || !status) {
    return <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 12 }}>{t("appShell.loading")}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24, overflowY: "auto" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Shield size={16} aria-hidden="true" />
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{t("settings.security.title")}</h2>
      </header>

      <section
        style={{
          padding: 16,
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "var(--bg-panel)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <p style={{ margin: 0, fontSize: 12, color: status.enabled ? "var(--text)" : "var(--text-muted)" }}>
          {status.enabled ? t("settings.security.statusEnabled") : t("settings.security.statusDisabled")}
        </p>
        <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>
          {t("settings.security.envPath", { path: status.envPath })}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {status.enabled ? (
            <>
              <Button variant="primary" onClick={() => void handleRotate()} disabled={busy}>
                <RefreshCw size={13} aria-hidden="true" /> {t("settings.security.rotate")}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDisableOpen(true)} disabled={busy}>
                <ShieldOff size={13} aria-hidden="true" /> {t("settings.security.disable")}
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => void handleEnable()} disabled={busy}>
              <KeyRound size={13} aria-hidden="true" /> {t("settings.security.enable")}
            </Button>
          )}
        </div>
        {status.enabled ? (
          <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>
            {t("settings.security.rotateWarning")} {t("settings.security.rotateRestart")}
          </p>
        ) : null}
      </section>

      {generatedSecret ? (
        <section
          style={{
            padding: 16,
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "var(--bg-panel)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
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
              {generatedSecret}
            </code>
            <Button variant="ghost" onClick={() => void handleCopySecret()}>
              <Copy size={13} aria-hidden="true" /> {t("onboarding.security.copyKey")}
            </Button>
          </div>
        </section>
      ) : null}

      {status.enabled ? (
        <section
          style={{
            padding: 16,
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "var(--bg-panel)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>{t("settings.security.sessions")}</h3>
          {sessions.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>{t("settings.security.noSessions")}</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {sessions.map((s) => (
                <li
                  key={s.jti}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "8px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                >
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{s.jti.slice(0, 12)}…</span>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                      {s.sub} · {s.ip ?? "—"} · exp {formatTimestamp(s.exp)}
                    </span>
                  </div>
                  <Button variant="ghost" onClick={() => void handleRevoke(s.jti)} disabled={busy}>
                    {t("settings.security.revoke")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <Dialog open={confirmDisableOpen} onOpenChange={setConfirmDisableOpen}>
        <DialogContent ariaLabel={t("settings.security.confirmDisableTitle")} style={{ width: 420 }}>
          <DialogTitle>{t("settings.security.confirmDisableTitle")}</DialogTitle>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 16px" }}>{t("settings.security.confirmDisableBody")}</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setConfirmDisableOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={() => void handleDisable()} disabled={busy}>
              {t("settings.security.disable")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
