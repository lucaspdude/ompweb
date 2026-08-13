"use client";

import { Box, Bot, Cable, LayoutPanelLeft, Puzzle, Settings2, Shield } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export type SettingsTab = "general" | "models" | "skills" | "plugins" | "mcp" | "sidebar" | "security";

const TABS: Array<{ id: SettingsTab; Icon: typeof Settings2; needsWorkspace?: boolean }> = [
  { id: "general", Icon: Settings2 },
  { id: "security", Icon: Shield },
  { id: "sidebar", Icon: LayoutPanelLeft },
  { id: "models", Icon: Box },
  { id: "mcp", Icon: Cable },
  { id: "skills", Icon: Bot, needsWorkspace: true },
  { id: "plugins", Icon: Puzzle, needsWorkspace: true },
];
export function SettingsTabs({ active, onSelect, workspaceReady = true }: {
  active: SettingsTab;
  onSelect: (tab: SettingsTab) => void;
  workspaceReady?: boolean;
}) {
  const { t } = useI18n();
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const enabled = TABS.filter((tab) => !(tab.needsWorkspace && !workspaceReady));
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = index + 1;
    if (event.key === "ArrowLeft") nextIndex = index - 1;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = enabled.length - 1;
    if (nextIndex !== null) {
      event.preventDefault();
      const next = enabled[nextIndex] ?? enabled[index];
      if (next) onSelect(next.id);
    }
  };
  return (
    <nav aria-label={t("settings.title")} role="tablist" style={{ display: "flex", gap: 3, padding: "7px 12px", borderBottom: "1px solid var(--border)", background: "var(--bg-panel)", flexShrink: 0, overflowX: "auto" }}>
      {TABS.map(({ id, Icon, needsWorkspace }, index) => {
        const label = t(`settings.tabs.${id}`);
        const selected = id === active;
        const disabled = Boolean(needsWorkspace && !workspaceReady);
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={`settings-tab-${id}`}
            aria-selected={selected}
            aria-controls={`settings-panel-${id}`}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onSelect(id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 9px", border: "none", borderRadius: "var(--radius-control)", background: selected ? "var(--bg-selected)" : "transparent", color: selected ? "var(--text)" : "var(--text-muted)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, fontSize: 12, whiteSpace: "nowrap" }}
          >
            <Icon size={13} aria-hidden="true" /> {label}
          </button>
        );
      })}
    </nav>
  );
}
