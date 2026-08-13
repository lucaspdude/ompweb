"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, KeyRound, RefreshCw, Trash2, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { copyText } from "@/lib/clipboard";
import { toast } from "./ui/toast";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle } from "./ui/primitives";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import { GIT_PROVIDERS, type GitKeyEntry, type GitProviderId } from "@/lib/ssh/types";

export function GitSshPanel() {
  const { t } = useI18n();
  const [keys, setKeys] = useState<GitKeyEntry[]>([]);
  const [busy, setBusy] = useState<GitProviderId | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addProvider, setAddProvider] = useState<GitProviderId>("github");
  const [addName, setAddName] = useState("");
  const [generatedPublicKey, setGeneratedPublicKey] = useState<{ publicKey: string; provider: GitProviderId } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<GitKeyEntry | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/ssh/git-keys", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { keys: GitKeyEntry[] };
      setKeys(data.keys);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleAdd = useCallback(async () => {
    if (!addName.match(/^[a-zA-Z0-9_-]{1,32}$/)) {
      toast.error(t("settings.developerTools.gitSsh.error.invalidName", { name: addName }));
      return;
    }
    setBusy(addProvider);
    try {
      const res = await fetch("/api/ssh/git-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: addProvider, name: addName }),
      });
      const data = (await res.json()) as { entry?: GitKeyEntry; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setGeneratedPublicKey({ publicKey: data.entry!.publicKey, provider: addProvider });
      setAddName("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [addName, addProvider, refresh, t]);

  const handleTest = useCallback(async (provider: GitProviderId) => {
    setBusy(provider);
    try {
      const res = await fetch(`/api/ssh/git-keys/${provider}`, { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; errorClass?: string; accountHint?: string | null };
      if (data.ok) {
        toast.info(t("settings.developerTools.gitSsh.test.success", { provider: GIT_PROVIDERS[provider].displayName, username: data.accountHint ?? "?" }));
      } else {
        toast.error(t("settings.developerTools.gitSsh.test.failedAuth", { provider: GIT_PROVIDERS[provider].displayName }));
      }
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [refresh, t]);

  const handleRemove = useCallback(async (entry: GitKeyEntry) => {
    setBusy(entry.provider);
    try {
      const res = await fetch(`/api/ssh/git-keys?provider=${encodeURIComponent(entry.provider)}&name=${encodeURIComponent(entry.name)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setConfirmRemove(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{t("settings.developerTools.gitSsh.title")}</h2>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)" }}>{t("settings.developerTools.gitSsh.description")}</p>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)}>
          <KeyRound size={13} aria-hidden="true" /> {t("settings.developerTools.gitSsh.addKey")}
        </Button>
      </header>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {(Object.keys(GIT_PROVIDERS) as GitProviderId[]).map((provider) => {
          const entry = keys.find((k) => k.provider === provider);
          return (
            <ProviderCard
              key={provider}
              provider={provider}
              entry={entry ?? null}
              busy={busy === provider}
              onTest={() => void handleTest(provider)}
              onRemove={() => setConfirmRemove(entry ?? null)}
            />
          );
        })}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent ariaLabel={t("settings.developerTools.gitSsh.add.title")} style={{ width: 480 }}>
          <DialogTitle>{t("settings.developerTools.gitSsh.add.title")}</DialogTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("settings.developerTools.gitSsh.add.providerLabel")}</span>
              <select
                value={addProvider}
                onChange={(e) => setAddProvider(e.target.value as GitProviderId)}
                style={{ padding: "6px 8px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12 }}
              >
                {(Object.keys(GIT_PROVIDERS) as GitProviderId[]).map((p) => (
                  <option key={p} value={p}>{GIT_PROVIDERS[p].displayName}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("settings.developerTools.gitSsh.add.nameLabel")}</span>
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder={GIT_PROVIDERS[addProvider].id}
                style={{ padding: "6px 8px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12 }}
              />
            </label>
            {generatedPublicKey ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 10, border: "1px solid var(--accent)", borderRadius: 6, background: "var(--bg)" }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("settings.developerTools.gitSsh.add.publicKeyLabel")}</span>
                <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
                  {generatedPublicKey.publicKey}
                </code>
                <div style={{ display: "flex", gap: 6 }}>
                  <Button variant="ghost" onClick={() => void copyText(generatedPublicKey.publicKey)}>
                    {t("settings.developerTools.gitSsh.add.copyPublic")}
                  </Button>
                  <Button variant="ghost" onClick={() => window.open(GIT_PROVIDERS[generatedPublicKey.provider].publicKeyUrl, "_blank", "noopener,noreferrer")}>
                    <ExternalLink size={12} aria-hidden="true" /> {t("settings.developerTools.gitSsh.add.openProvider", { provider: GIT_PROVIDERS[generatedPublicKey.provider].displayName })}
                  </Button>
                </div>
              </div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="ghost" onClick={() => { setAddOpen(false); setGeneratedPublicKey(null); }}>
                <X size={12} aria-hidden="true" /> {t("common.cancel")}
              </Button>
              <Button variant="primary" onClick={() => void handleAdd()} disabled={busy !== null || addName.length === 0}>
                {t("settings.developerTools.gitSsh.add.submit")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmRemove !== null} onOpenChange={(open) => !open && setConfirmRemove(null)}>
        <DialogContent ariaLabel={t("settings.developerTools.gitSsh.remove.confirmTitle", { provider: confirmRemove ? GIT_PROVIDERS[confirmRemove.provider].displayName : "" })} style={{ width: 420 }}>
          <DialogTitle>{t("settings.developerTools.gitSsh.remove.confirmTitle", { provider: confirmRemove ? GIT_PROVIDERS[confirmRemove.provider].displayName : "" })}</DialogTitle>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 16px" }}>{t("settings.developerTools.gitSsh.remove.confirmBody", { provider: confirmRemove ? GIT_PROVIDERS[confirmRemove.provider].displayName : "" })}</p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={() => setConfirmRemove(null)}>{t("common.cancel")}</Button>
            <Button variant="danger" onClick={() => confirmRemove && void handleRemove(confirmRemove)} disabled={busy !== null}>
              <Trash2 size={12} aria-hidden="true" /> {t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProviderCard({ provider, entry, busy, onTest, onRemove }: { provider: GitProviderId; entry: GitKeyEntry | null; busy: boolean; onTest: () => void; onRemove: () => void }) {
  const { t } = useI18n();
  const ago = useRelativeTime(entry?.lastTestAt);
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-panel)", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{GIT_PROVIDERS[provider].displayName}</h3>
        {entry ? <CheckCircle2 size={16} color="var(--accent)" /> : null}
      </header>
      {entry ? (
        <>
          <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>
            {entry.keyPath}
            {entry.accountHint ? ` · ${entry.accountHint}` : ""}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>
            {entry.lastTestAt ? t("settings.developerTools.gitSsh.lastTest", { ago }) : t("settings.developerTools.gitSsh.neverTested")}
          </p>
          <div style={{ display: "flex", gap: 6 }}>
            <Button variant="ghost" onClick={onTest} disabled={busy}>
              <RefreshCw size={12} aria-hidden="true" /> {t("settings.developerTools.gitSsh.testButton")}
            </Button>
            <Button variant="ghost" onClick={onRemove} disabled={busy}>
              <Trash2 size={12} aria-hidden="true" /> {t("settings.developerTools.gitSsh.removeButton")}
            </Button>
          </div>
        </>
      ) : (
        <Button variant="primary" onClick={onRemove} disabled>
          {t("settings.developerTools.gitSsh.addKey")}
        </Button>
      )}
    </div>
  );
}
