"use client";

import { useState } from "react";
import { CliToolsPanel } from "./CliToolsPanel";
import { useI18n } from "@/lib/i18n";

type Section = "clis" | "git-ssh" | "ssh-servers";

export function DeveloperTools() {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>("clis");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 24, height: "100%", overflow: "hidden" }}>
      <nav
        aria-label={t("settings.developerTools.tabLabel")}
        role="tablist"
        style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", padding: "0 0 8px" }}
      >
        {(["clis", "git-ssh", "ssh-servers"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={section === s}
            onClick={() => setSection(s)}
            style={{
              background: section === s ? "var(--bg-selected)" : "transparent",
              color: section === s ? "var(--text)" : "var(--text-muted)",
              border: "none",
              padding: "6px 10px",
              borderRadius: "var(--radius-control)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {s === "clis" ? t("settings.developerTools.clisTabLabel") : s === "git-ssh" ? t("settings.developerTools.gitSshTabLabel") : t("settings.developerTools.sshServerTabLabel")}
          </button>
        ))}
      </nav>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {section === "clis" ? <CliToolsPanel /> : null}
        {section === "git-ssh" ? (
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("settings.developerTools.gitSsh.comingSoon")}</p>
        ) : null}
        {section === "ssh-servers" ? (
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("settings.developerTools.sshServers.comingSoon")}</p>
        ) : null}
      </div>
    </div>
  );
}
