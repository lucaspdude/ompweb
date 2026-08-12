"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";

type McpServer = { name: string; config: Record<string, unknown> };
type McpUserConfig = { path: string; servers: McpServer[]; disabledServers: string[]; error?: string };
type McpLiveStatus = "connected" | "connecting" | "not_connected" | "inactive" | "disabled" | "configured";
type McpLiveServer = { name: string; source: string; status: McpLiveStatus; type?: string };

const inputStyle = { width: "100%", padding: "7px 9px", border: "1px solid var(--border)", borderRadius: "var(--radius-control)", background: "var(--bg)", color: "var(--text)", font: "12px var(--font-mono)" } as const;

const newServer = () => JSON.stringify({ type: "stdio", command: "", args: [] }, null, 2);

function serverSummary(config: Record<string, unknown>): { type: string; target: string; enabled: boolean; valid: boolean } {
  const type = typeof config.type === "string" && config.type !== "stdio" ? config.type : "stdio";
  const command = typeof config.command === "string" ? config.command.trim() : "";
  const url = typeof config.url === "string" ? config.url.trim() : "";
  const hasCommand = command.length > 0;
  const hasUrl = url.length > 0;
  const valid = (hasCommand || hasUrl) && !(hasCommand && hasUrl) && (type === "http" || type === "sse" ? hasUrl : hasCommand);
  return {
    type,
    target: type === "http" || type === "sse" ? url : `${command}${Array.isArray(config.args) ? " " + config.args.join(" ") : ""}`.trim(),
    enabled: config.enabled !== false,
    valid,
  };
}

function McpStatusDot({ status }: { status: McpLiveStatus }) {
  const { t } = useI18n();
  const color = status === "connected" ? "var(--accent)"
    : status === "disabled" ? "var(--text-dim)"
    : status === "inactive" || status === "not_connected" || status === "connecting" ? "var(--text-muted)"
    : "var(--border)";
  return <span aria-hidden="true" style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: color }} title={t(`settings.mcp.editor.status.${status}`)} />;
}

export function McpConfig({ cwd, sessionId }: { cwd: string | null; sessionId?: string | null }) {
  const { t } = useI18n();
  const [servers, setServers] = useState<McpServer[]>([]);
  const [userConfig, setUserConfig] = useState<McpUserConfig | null>(null);
  const [liveServers, setLiveServers] = useState<McpLiveServer[] | null>(null);
  const [inventory, setInventory] = useState<McpLiveServer[] | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [source, setSource] = useState(newServer);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (cwd) params.set("cwd", cwd);
      if (sessionId) params.set("sessionId", sessionId);
      const response = await fetch(`/api/mcp?${params}`);
      const data = await response.json() as { servers?: McpServer[]; user?: McpUserConfig; inventory?: McpLiveServer[]; liveServers?: McpLiveServer[]; liveError?: string; path?: string; error?: string };
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      setServers(data.servers ?? []);
      setUserConfig(data.user ?? null);
      setLiveServers(Array.isArray(data.liveServers) ? data.liveServers : null);
      setInventory(Array.isArray(data.inventory) ? data.inventory : null);
      setLiveError(data.liveError ?? null);
      setPath(data.path ?? null);
      setSelected((current) => current && data.servers?.some((server) => server.name === current) ? current : null);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(detail);
      toast.error(t("settings.mcp.editor.loadError"), detail);
    } finally {
      setLoading(false);
    }
  }, [cwd, sessionId, t]);

  useEffect(() => { void load(); }, [load]);

  const choose = (server: McpServer) => {
    setSelected(server.name);
    setName(server.name);
    setSource(JSON.stringify(server.config, null, 2));
    setMessage(null);
  };

  const add = () => {
    setSelected(null);
    setName("");
    setSource(newServer());
    setMessage(null);
  };

  const parse = (): Record<string, unknown> | null => {
    try {
      const value = JSON.parse(source) as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(t("settings.mcp.editor.mustBeObject"));
      return value as Record<string, unknown>;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("settings.mcp.editor.invalidJson"));
      return null;
    }
  };

  const check = async () => {
    const server = parse();
    if (!server) return;
    setSaving(true);
    try {
      const response = await fetch("/api/mcp", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, server }) });
      const data = await response.json() as { message?: string; error?: string };
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      setMessage(data.message ?? t("settings.mcp.editor.checkValidMessage"));
      toast.success(t("settings.mcp.editor.checkValidMessage"));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(detail);
      toast.error(t("settings.mcp.editor.checkInvalidMessage"), detail);
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    const server = parse();
    if (!server) return;
    setSaving(true);
    try {
      const response = await fetch("/api/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cwd, name, previousName: selected ?? undefined, server }) });
      const data = await response.json() as { error?: string };
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      setSelected(name);
      setMessage(t("settings.mcp.editor.savedMessage"));
      toast.success(t("settings.mcp.editor.savedToast", { name }));
      await load();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(detail);
      toast.error(t("settings.mcp.editor.saveError"), detail);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const response = await fetch("/api/mcp", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cwd, name: selected }) });
      const data = await response.json() as { error?: string };
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      add();
      setMessage(t("settings.mcp.editor.removedMessage"));
      toast.success(t("settings.mcp.editor.removedToast", { name: selected }));
      await load();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(detail);
      toast.error(t("settings.mcp.editor.removeError"), detail);
    } finally {
      setSaving(false);
    }
  };

  const displayedServers = liveServers ?? inventory;

  return <>
    <section style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: "var(--radius-card)", overflow: "hidden", background: "var(--bg-panel)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--border)" }}><strong style={{ fontSize: 12, color: "var(--text)" }}>{t("settings.mcp.editor.configuredTitle")}</strong><button type="button" title={t("settings.mcp.editor.refreshAria")} onClick={() => void load()} disabled={loading} style={{ marginLeft: "auto", padding: 3, border: "none", background: "transparent", color: "var(--text-muted)", cursor: loading ? "wait" : "pointer" }}><RefreshCw size={14} /></button></div>
      <div style={{ padding: 12, display: "grid", gap: 12 }}>
        {displayedServers !== null ? <div style={{ display: "grid", gap: 10 }}>{Array.from(new Set(displayedServers.map((server) => server.source))).map((sourceName) => <div key={sourceName} style={{ display: "grid", gap: 4 }}><div style={{ color: "var(--text-muted)", fontSize: 11 }}>{sourceName}</div>{displayedServers.filter((server) => server.source === sourceName).map((server) => { return <div key={`${sourceName}:${server.name}`} style={{ display: "flex", alignItems: "center", gap: 6, color: server.status === "not_connected" || server.status === "connecting" ? "var(--text-muted)" : server.status === "disabled" ? "var(--text-dim)" : "var(--text)", fontSize: 11 }}><McpStatusDot status={server.status} />{server.name}<span style={{ marginLeft: "auto", fontSize: 9, color: "var(--text-dim)" }}>{t(`settings.mcp.editor.status.${server.status}`)}</span></div>; })}</div>)}</div> : null}
      </div>
    </section>
    {cwd && <div style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: "var(--radius-card)", overflow: "hidden", background: "var(--bg-panel)" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--border)" }}><strong style={{ fontSize: 12, color: "var(--text)", flexShrink: 0 }}>{t("settings.mcp.editor.projectServersTitle")}</strong><code style={{ flex: 1, minWidth: 0, color: "var(--text-dim)", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{path ?? t("settings.mcp.editor.pathLoading")}</code>{(() => {
      const total = servers.length;
      if (total === 0) return null;
      const enabled = servers.filter((s) => serverSummary(s.config).enabled && serverSummary(s.config).valid).length;
      const invalid = servers.filter((s) => !serverSummary(s.config).valid).length;
      const summary = t("settings.mcp.editor.enabledCount", { enabled, total });
      return <span style={{ marginLeft: 4, fontSize: 10, color: "var(--text-dim)", whiteSpace: "nowrap" }}>{summary}{invalid > 0 ? t("settings.mcp.editor.invalidSuffix", { n: invalid }) : ""}</span>;
    })()}</div>
    <div className="mcp-editor-grid" style={{ display: "grid", gridTemplateColumns: "minmax(120px, 0.35fr) minmax(0, 1fr)", minHeight: 250 }}>
      <div style={{ borderRight: "1px solid var(--border)", padding: 6 }}>
        {servers.map((server) => {
          const summary = serverSummary(server.config);
          return (
            <button key={server.name} type="button" onClick={() => choose(server)} title={`${server.name} — ${summary.type} · ${summary.target || ""}`} style={{ display: "block", width: "100%", padding: "7px 8px", border: "none", borderRadius: 5, background: selected === server.name ? "var(--bg-selected)" : "transparent", color: "var(--text)", textAlign: "left", font: "11px var(--font-mono)", cursor: "pointer", overflow: "hidden" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: summary.valid ? (summary.enabled ? "var(--accent)" : "var(--border)") : "var(--status-error)" }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{server.name}</span>
              </span>
              <span style={{ display: "block", marginTop: 2, fontSize: 9, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {summary.type}{summary.enabled ? "" : ` · ${t("settings.mcp.editor.status.disabled")}`}{!summary.valid ? ` · ${t("settings.mcp.editor.status.disabled")}` : ""}
                {summary.target ? ` · ${summary.target}` : ""}
              </span>
            </button>
          );
        })}
        {!loading && servers.length === 0 && <div style={{ padding: "7px 8px", color: "var(--text-dim)", fontSize: 11 }}>{t("settings.mcp.editor.noServers")}</div>}
        <button type="button" onClick={add} style={{ display: "flex", alignItems: "center", gap: 4, width: "100%", marginTop: 5, padding: "6px 8px", border: "1px dashed var(--border)", borderRadius: 5, background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontSize: 11 }}><Plus size={13} /> {t("settings.mcp.editor.addServer")}</button>
      </div>
      <div style={{ minWidth: 0, padding: 12 }}>
        <label style={{ display: "block", color: "var(--text-muted)", fontSize: 11 }}>{t("settings.mcp.editor.serverNameLabel")}<input value={name} onChange={(event) => setName(event.target.value)} placeholder="filesystem" style={{ ...inputStyle, marginTop: 4 }} /></label>
        <label style={{ display: "block", marginTop: 9, color: "var(--text-muted)", fontSize: 11 }}>{t("settings.mcp.editor.configLabel")}<textarea value={source} onChange={(event) => setSource(event.target.value)} spellCheck={false} style={{ ...inputStyle, minHeight: 125, marginTop: 4, resize: "vertical", lineHeight: 1.45 }} /></label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 9 }}><button type="button" onClick={() => void check()} disabled={saving} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 9px", border: "1px solid var(--border)", borderRadius: "var(--radius-control)", background: "transparent", color: "var(--text)", cursor: saving ? "wait" : "pointer", fontSize: 11 }}><Check size={13} /> {t("settings.mcp.editor.checkButton")}</button><button type="button" onClick={() => void save()} disabled={saving || !name.trim()} style={{ padding: "6px 9px", border: "none", borderRadius: "var(--radius-control)", background: "var(--accent)", color: "var(--on-accent)", cursor: saving || !name.trim() ? "default" : "pointer", fontSize: 11 }}>{saving ? t("settings.mcp.editor.saving") : t("settings.mcp.editor.saveButton")}</button><button type="button" onClick={() => void remove()} disabled={saving || !selected} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 9px", border: "1px solid var(--border)", borderRadius: "var(--radius-control)", background: "transparent", color: saving || !selected ? "var(--text-dim)" : "var(--status-error)", cursor: saving || !selected ? "not-allowed" : "pointer", fontSize: 11 }}><Trash2 size={13} /> {t("settings.mcp.editor.removeButton")}</button></div>
        {message && <div role="status" style={{ marginTop: 9, color: "var(--text-muted)", fontSize: 11, lineHeight: 1.4 }}>{message}</div>}
      </div>
    </div>
    </div>}
  </>;
}
