"use client";

import { Files, GitBranch } from "lucide-react";
import { translate, useI18n } from "@/lib/i18n";

export type RightSidebarTab = "files" | "changes";

interface Props {
  activeTab: RightSidebarTab;
  onSelectTab: (tab: RightSidebarTab) => void;
  hasChanges: boolean;
  disabled?: boolean;
}

const TAB_DEFS: Array<{ id: RightSidebarTab; icon: typeof Files; labelKey: string; ariaKey: string }> = [
  { id: "files", icon: Files, labelKey: "rightSidebar.tabs.files", ariaKey: "rightSidebar.tabs.filesAria" },
  { id: "changes", icon: GitBranch, labelKey: "rightSidebar.tabs.changes", ariaKey: "rightSidebar.tabs.changesAria" },
];

export function RightSidebarRail({ activeTab, onSelectTab, hasChanges, disabled }: Props) {
  const { t } = useI18n();
  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: 6,
        background: "var(--bg-panel)",
        borderRight: "1px solid var(--border)",
        flexShrink: 0,
        width: 44,
        alignItems: "center",
      }}
    >
      {TAB_DEFS.map(({ id, icon: Icon, labelKey, ariaKey }) => {
        const isActive = activeTab === id;
        const isDisabled = !!disabled;
        const showDot = id === "changes" && hasChanges;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={t(ariaKey)}
            aria-controls={`right-sidebar-tabpanel-${id}`}
            disabled={isDisabled}
            onClick={() => onSelectTab(id)}
            style={{
              position: "relative",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: isActive ? "var(--bg-selected)" : "transparent",
              color: isDisabled ? "var(--text-dim)" : isActive ? "var(--text)" : "var(--text-muted)",
              cursor: isDisabled ? "not-allowed" : "pointer",
              borderRadius: 6,
              padding: 0,
            }}
            title={t(labelKey)}
          >
            <Icon size={16} strokeWidth={1.6} aria-hidden="true" />
            {showDot && (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  background: "var(--accent)",
                }}
              />
            )}
          </button>
        );
      })}
      <span style={{ flex: 1 }} />
    </div>
  );
}

export function rightSidebarTabLabel(tab: RightSidebarTab): string {
  const key = tab === "files" ? "rightSidebar.tabs.files" : "rightSidebar.tabs.changes";
  return translate(key);
}
