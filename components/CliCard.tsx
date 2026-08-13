"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, LogIn, Terminal, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "./ui/button";
import { toast } from "./ui/toast";
import { useInstall, useLogin, type FlowStatus } from "@/hooks/useCliSession";
import type { CliSpec } from "@/lib/cli-tools/types";
import { CLIS } from "@/lib/cli-tools/specs";

interface CliStatus {
  installed: boolean;
  authenticated: boolean;
  version: string | null;
  accountHint: string | null;
  detail: string | null;
  runningJobs: Array<{ id: string; kind: "install" | "login"; pid: number }>;
}

function statusLabelKey(status: FlowStatus, t: ReturnType<typeof useI18n>["t"]): string {
  if (status === "running") return t("settings.cli.installing", { name: "" }).replace("…", "");
  if (status === "done") return t("settings.cli.installed");
  if (status === "failed") return t("settings.cli.installFailed", { name: "", detail: "" }).split(".")[0];
  return t("settings.cli.notInstalled");
}

export function CliCard({ cliId }: { cliId: "az" | "gh" }) {
  const { t } = useI18n();
  const spec: CliSpec = CLIS[cliId];
  const [status, setStatus] = useState<CliStatus | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const install = useInstall(cliId);
  const login = useLogin(cliId);

  const refresh = async () => {
    const res = await fetch(`/api/cli-tools/${cliId}/status`, { cache: "no-store" });
    if (res.ok) setStatus(await res.json() as CliStatus);
  };

  useEffect(() => {
    void refresh();
  }, [cliId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (install.status !== "idle" || login.status !== "idle") {
      // Poll the status endpoint while a flow is running.
      const t = setInterval(() => { void refresh(); }, 2000);
      return () => clearInterval(t);
    }
    return undefined;
  }, [install.status, login.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInstall = async () => {
    try {
      await install.install();
      toast.info(t("settings.cli.installing", { name: spec.displayName }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleLogin = async () => {
    try {
      await login.login();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSignOut = async () => {
    // Best-effort: run the CLI's logout command via the install endpoint
    // (which reuses the spawn machinery). For v1 we just show a toast.
    toast.info(t("settings.cli.signOut"));
  };

  const currentLines = login.lines.length > 0 ? login.lines : install.lines;
  const currentStatus = login.status !== "idle" ? login.status : install.status;
  const authHint = status?.accountHint ?? null;

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--bg-panel)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{spec.displayName}</h3>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>{spec.helpText}</p>
        </div>
        {status?.installed ? <CheckCircle2 size={16} color="var(--accent)" aria-label="installed" /> : null}
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
        <span style={{ color: "var(--text-muted)" }}>
          {status?.installed ? t("settings.cli.installed") : t("settings.cli.notInstalled")}
          {status?.version ? ` · ${status.version}` : ""}
        </span>
        {authHint ? (
          <span style={{ color: "var(--text)" }}>{t("settings.cli.signedInAs", { name: authHint })}</span>
        ) : status?.installed ? (
          <span style={{ color: "var(--text-muted)" }}>{t("settings.cli.notSignedIn")}</span>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {!status?.installed ? (
          <Button variant="primary" onClick={() => void handleInstall()} disabled={currentStatus === "running"}>
            <Terminal size={13} aria-hidden="true" /> {t("settings.cli.installButton", { name: spec.displayName })}
          </Button>
        ) : !authHint ? (
          <Button variant="primary" onClick={() => void handleLogin()} disabled={currentStatus === "running"}>
            <LogIn size={13} aria-hidden="true" /> {t("settings.cli.signIn")}
          </Button>
        ) : (
          <>
            <Button variant="primary" onClick={() => void handleLogin()} disabled={currentStatus === "running"}>
              <LogIn size={13} aria-hidden="true" /> {t("settings.cli.signIn")}
            </Button>
            <Button variant="ghost" onClick={() => void handleSignOut()} disabled={currentStatus === "running"}>
              <X size={13} aria-hidden="true" /> {t("settings.cli.signOut")}
            </Button>
          </>
        )}
        {currentStatus === "running" ? (
          <Button variant="ghost" onClick={() => { install.cancel(); login.cancel(); }}>
            {t("settings.cli.cancelInstall")}
          </Button>
        ) : null}
      </div>

      {login.authUrl ? (
        <section
          style={{
            padding: 10,
            border: "1px solid var(--accent)",
            borderRadius: 6,
            background: "var(--bg)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 11,
          }}
        >
          <p style={{ margin: 0 }}>{t("settings.cli.loginInstructions", { name: spec.displayName })}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 4 }}>
              {login.authCode}
            </code>
            <Button variant="ghost" onClick={() => window.open(login.authUrl!, "_blank", "noopener,noreferrer")}>
              {t("settings.cli.openUrl")}
            </Button>
            <Button variant="ghost" onClick={() => void login.ack()}>
              {t("settings.cli.continuePoll")}
            </Button>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setLogsOpen((open) => !open)}
        style={{ background: "none", border: "none", padding: 0, color: "var(--text-muted)", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, alignSelf: "flex-start" }}
      >
        {logsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {t("settings.cli.installLogsLabel")}
        <span style={{ marginLeft: 6, fontSize: 10, color: statusLabelKey(currentStatus, t) ? "var(--text-muted)" : undefined }}>
          {currentStatus !== "idle" ? currentStatus : ""}
        </span>
      </button>
      {logsOpen ? (
        <pre
          style={{
            margin: 0,
            padding: 10,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            maxHeight: 240,
            overflow: "auto",
            fontFamily: "ui-monospace, monospace",
            fontSize: 10,
            color: "var(--text-muted)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {currentLines.length === 0 ? t("settings.cli.noLogs") : currentLines.join("\n")}
        </pre>
      ) : null}
    </div>
  );
}
