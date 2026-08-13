"use client";

import { useState } from "react";
import { CliToolsPanel } from "./CliToolsPanel";
import { GitSshPanel } from "./GitSshPanel";
import { SshServersPanel } from "./SshServersPanel";
import { useI18n } from "@/lib/i18n";

type Section = "clis" | "git-ssh" | "ssh-servers";

const SECTION_LABEL: Record<Section, string> = {
  "clis": "settings.developerTools.clisTabLabel",
  "git-ssh": "settings.developerTools.gitSshTabLabel",
  "ssh-servers": "settings.developerTools.sshServerTabLabel",
};

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
        {(Object.keys(SECTION_LABEL) as Section[]).map((s) => (
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
            {t(SECTION_LABEL[s])}
          </button>
        ))}
      </nav>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {section === "clis" ? <CliToolsPanel /> : null}
        {section === "git-ssh" ? <GitSshPanel /> : null}
        {section === "ssh-servers" ? <SshServersPanel /> : null}
      </div>
    </div>
  );
}
