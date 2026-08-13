"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Server, Trash2, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { copyText } from "@/lib/clipboard";
import { toast } from "./ui/toast";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle } from "./ui/primitives";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import type { ServerConnection } from "@/lib/ssh/types";

export function SshServersPanel() {
  const { t } = useI18n();
  const [servers, setServers] = useState<ServerConnection[]>([]);
  const [busyAlias, setBusyAlias] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<ServerConnection | null>(null);
  const [form, setForm] = useState({ alias: "", hostName: "", user: "", port: 22 });
  const [generatedKey, setGeneratedKey] = useState<{ alias: string; publicKey: string } | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/ssh/servers", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { servers: ServerConnection[] };
      setServers(data.servers);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleAdd = useCallback(async () => {
    if (!form.alias.match(/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/)) {
      toast.error(t("settings.developerTools.sshServers.error.invalidAlias"));
      return;
    }
    setBusyAlias(form.alias);
    try {
      const res = await fetch("/api/ssh/servers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, port: Number(form.port) || 22 }),
      });
      const data = (await res.json()) as { server?: ServerConnection; publicKey?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.publicKey && data.server) setGeneratedKey({ alias: data.server.alias, publicKey: data.publicKey });
      setForm({ alias: "", hostName: "", user: "", port: 22 });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAlias(null);
    }
  }, [form, refresh, t]);

  const handleTest = useCallback(async (alias: string) => {
    setBusyAlias(alias);
    try {
      const res = await fetch(`/api/ssh/servers/${encodeURIComponent(alias)}`, { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; errorClass?: string; accountHint?: string | null };
      if (data.ok) {
        toast.info(t("settings.developerTools.sshServers.test.success", { alias }));
      } else {
        toast.error(t("settings.developerTools.sshServers.test.failedOther", { detail: data.errorClass ?? "?" }));
      }
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAlias(null);
    }
  }, [refresh, t]);

  const handleRemove = useCallback(async (conn: ServerConnection) => {
    setBusyAlias(conn.alias);
    try {
      const res = await fetch(`/api/ssh/servers?alias=${encodeURIComponent(conn.alias)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setConfirmRemove(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAlias(null);
    }
  }, [refresh]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{t("settings.developerTools.sshServers.title")}</h2>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>{t("settings.developerTools.sshServers.description")}</p>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)}>
          <Plus size={13} aria-hidden="true" /> {t("settings.developerTools.sshServers.addServer")}
        </Button>
      </header>

      <div style={{ padding: 10, border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-panel)", fontSize: 11, color: "var(--text-muted)" }}>
        {t("settings.developerTools.sshServers.limitation")}
      </div>

      {servers.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("settings.developerTools.sshServers.noServers")}</p>
      ) : (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))" }}>
          {servers.map((conn) => (
            <ServerCard key={conn.alias} conn={conn} busy={busyAlias === conn.alias} onTest={() => void handleTest(conn.alias)} onRemove={() => setConfirmRemove(conn)} />
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent ariaLabel={t("settings.developerTools.sshServers.add.title")} style={{ width: 480 }}>
          <DialogTitle>{t("settings.developerTools.sshServers.add.title")}</DialogTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            <Field label={t("settings.developerTools.sshServers.add.aliasLabel")} value={form.alias} onChange={(v) => setForm({ ...form, alias: v })} placeholder="prod" />
            <Field label={t("settings.developerTools.sshServers.add.hostLabel")} value={form.hostName} onChange={(v) => setForm({ ...form, hostName: v })} placeholder="myserver.example.com" />
            <Field label={t("settings.developerTools.sshServers.add.userLabel")} value={form.user} onChange={(v) => setForm({ ...form, user: v })} placeholder="deploy" />
            <Field label={t("settings.developerTools.sshServers.add.portLabel")} value={String(form.port)} onChange={(v) => setForm({ ...form, port: Number(v) || 22 })} placeholder="22" />
            {generatedKey ? (
              <div style={{ padding: 10, border: "1px solid var(--accent)", borderRadius: 6, background: "var(--bg)", display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("settings.developerTools.sshServers.add.publicKeyLabel")}</span>
                <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, wordBreak: "break-all", whiteSpace: "pre-wrap" }}>{generatedKey.publicKey}</code>
                <Button variant="ghost" onClick={() => void copyText(generatedKey.publicKey)}>
                  {t("settings.developerTools.sshServers.add.copyPublic")}
                </Button>
              </div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="ghost" onClick={() => { setAddOpen(false); setGeneratedKey(null); }}>
                <X size={12} aria-hidden="true" /> {t("common.cancel")}
              </Button>
              <Button variant="primary" onClick={() => void handleAdd()} disabled={busyAlias !== null}>
                {t("settings.developerTools.sshServers.add.submit")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmRemove !== null} onOpenChange={(open) => !open && setConfirmRemove(null)}>
        <DialogContent ariaLabel={t("settings.developerTools.sshServers.remove.confirmTitle", { alias: confirmRemove?.alias ?? "" })} style={{ width: 420 }}>
          <DialogTitle>{t("settings.developerTools.sshServers.remove.confirmTitle", { alias: confirmRemove?.alias ?? "" })}</DialogTitle>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 16px" }}>
            {t("settings.developerTools.sshServers.remove.confirmBody", { alias: confirmRemove?.alias ?? "" })}
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setConfirmRemove(null)}>{t("common.cancel")}</Button>
            <Button variant="danger" onClick={() => confirmRemove && void handleRemove(confirmRemove)} disabled={busyAlias !== null}>
              <Trash2 size={12} aria-hidden="true" /> {t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ padding: "6px 8px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12 }}
      />
    </label>
  );
}

function ServerCard({ conn, busy, onTest, onRemove }: { conn: ServerConnection; busy: boolean; onTest: () => void; onRemove: () => void }) {
  const { t } = useI18n();
  const ago = useRelativeTime(conn.lastTestAt);
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-panel)", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Server size={14} aria-hidden="true" />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{conn.alias}</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Button variant="ghost" onClick={onTest} disabled={busy}>
            <RefreshCw size={12} aria-hidden="true" /> {t("settings.developerTools.sshServers.testButton")}
          </Button>
          <Button variant="ghost" onClick={onRemove} disabled={busy}>
            <Trash2 size={12} aria-hidden="true" /> {t("settings.developerTools.sshServers.removeButton")}
          </Button>
        </div>
      </header>
      <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)", fontFamily: "ui-monospace, monospace" }}>
        {conn.user}@{conn.hostName}:{conn.port} · {conn.keyPath}
      </p>
      <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>
        {conn.lastTestAt ? t("settings.developerTools.sshServers.lastTest", { ago }) : t("settings.developerTools.sshServers.neverTested")}
      </p>
    </div>
  );
}
