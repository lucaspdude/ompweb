"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { FileExplorer, type FileExplorerHandle } from "./FileExplorer";
import { FileViewer } from "./FileViewer";
import { TabBar, type Tab } from "./TabBar";
import { GitChangesPanel } from "./GitChangesPanel";
import { RightSidebarRail, type RightSidebarTab, type RightSidebarWidthState } from "./RightSidebarRail";

const FILES_TAB: RightSidebarTab = "files";

const WIDTH_BY_STATE: Record<RightSidebarWidthState, number> = {
  collapsed: 44,
  default: 560,
  wide: 760,
};

const STORAGE_KEY = "rocinante:right-sidebar-state";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCwd: string | null;
  fileTabs: Tab[];
  activeFileTabId: string | null;
  onSelectFileTab: (tabId: string) => void;
  onCloseFileTab: (tabId: string) => void;
  onOpenFile: (filePath: string, fileName: string, sourceSessionId?: string | null) => void;
  onMentionLines?: (relativePath: string, startLine: number, endLine: number) => void;
  sourceSessionId?: string | null;
  explorerRefreshKey: number;
  gitChangesRefreshKey: number;
  isMobile?: boolean;
}

export function RightSidebar({
  open,
  onOpenChange,
  selectedCwd,
  fileTabs,
  activeFileTabId,
  onSelectFileTab,
  onCloseFileTab,
  onOpenFile,
  onMentionLines,
  sourceSessionId,
  explorerRefreshKey,
  gitChangesRefreshKey,
  isMobile,
}: Props) {
  const { t } = useI18n();
  const [widthState, setWidthState] = useState<RightSidebarWidthState>("default");
  const [activeTab, setActiveTab] = useState<RightSidebarTab>(FILES_TAB);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "collapsed" || stored === "default" || stored === "wide") {
        setWidthState(stored);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, widthState);
    } catch { /* ignore */ }
  }, [widthState]);

  const handleSelectTab = useCallback((tab: RightSidebarTab) => {
    if (tab === activeTab) {
      if (!open) {
        // Re-opening from closed: jump straight to default width so
        // the user sees the file tree, not the rail-only collapsed
        // state. The previous design left the user with an empty 44px
        // column and no obvious way to recover without a reload.
        onOpenChange(true);
        setWidthState("default");
      } else {
        setWidthState((prev) => {
          if (prev === "collapsed") return "default";
          if (prev === "default") return "wide";
          if (prev === "wide") return "collapsed";
          return "default";
        });
      }
    } else {
      // Different tab: switch to it, ensure open, expand if collapsed.
      setActiveTab(tab);
      if (!open) onOpenChange(true);
      if (widthState === "collapsed") setWidthState("default");
    }
  }, [activeTab, open, widthState, onOpenChange]);

  const handleSetWidthState = useCallback((next: RightSidebarWidthState) => {
    setWidthState(next);
  }, []);

  const handleCollapse = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const activeFileTab = fileTabs.find((t) => t.id === activeFileTabId) ?? null;
  // The content panel is visible whenever the sidebar is open AND not
  // collapsed to the rail-only state.
  const showContent = open && widthState !== "collapsed";
  // Width collapses to rail-only (44px) when the sidebar is closed.
  const width = open ? WIDTH_BY_STATE[widthState] : WIDTH_BY_STATE.collapsed;

  return (
    <aside
      className="right-sidebar-container"
      data-state={widthState}
      data-tab={activeTab}
      data-open={open ? "true" : "false"}
      style={{
        display: isMobile ? (open ? "flex" : "none") : "flex",
        flexDirection: "row",
        flexShrink: 0,
        width,
        minWidth: 0,
        borderLeft: "1px solid var(--border)",
        background: "var(--bg)",
        transition: "width var(--dur-med) var(--ease-out-warm)",
        overflow: "hidden",
      }}
    >
      <RightSidebarRail
        activeTab={activeTab}
        widthState={widthState}
        onSelectTab={handleSelectTab}
        onSetWidthState={handleSetWidthState}
        onCollapse={handleCollapse}
        hasChanges={hasChanges}
        disabled={!selectedCwd}
      />
      {showContent && (
        <div
          role="tabpanel"
          id={`right-sidebar-tabpanel-${activeTab}`}
          style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}
        >
          {activeTab === FILES_TAB ? (
            <FilesTab
              selectedCwd={selectedCwd}
              fileTabs={fileTabs}
              activeFileTabId={activeFileTabId}
              activeFileTab={activeFileTab}
              onSelectFileTab={onSelectFileTab}
              onCloseFileTab={onCloseFileTab}
              onOpenFile={onOpenFile}
              onMentionLines={onMentionLines}
              sourceSessionId={sourceSessionId}
              explorerRefreshKey={explorerRefreshKey}
            />
          ) : (
            <GitChangesPanel
              cwd={selectedCwd}
              onOpenFile={onOpenFile}
              onChangesCount={(count) => setHasChanges(count > 0)}
              key={`changes-${gitChangesRefreshKey}`}
            />
          )}
        </div>
      )}
    </aside>
  );
}

interface FilesTabProps {
  selectedCwd: string | null;
  fileTabs: Tab[];
  activeFileTabId: string | null;
  activeFileTab: Tab | null;
  onSelectFileTab: (tabId: string) => void;
  onCloseFileTab: (tabId: string) => void;
  onOpenFile: (filePath: string, fileName: string, sourceSessionId?: string | null) => void;
  onMentionLines?: (relativePath: string, startLine: number, endLine: number) => void;
  sourceSessionId?: string | null;
  explorerRefreshKey: number;
}

function FilesTab({
  selectedCwd,
  fileTabs,
  activeFileTabId,
  activeFileTab,
  onSelectFileTab,
  onCloseFileTab,
  onOpenFile,
  onMentionLines,
  sourceSessionId,
  explorerRefreshKey,
}: FilesTabProps) {
  const { t } = useI18n();
  // FileExplorer exposes a handle for the upload-picker; we hold a ref
  // so the FileExplorer instance is stable across renders (the
  // upload button triggers a method on the instance).
  const fileExplorerRef = useRef<FileExplorerHandle | null>(null);

  if (!selectedCwd) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          color: "var(--text-dim)",
          textAlign: "center",
        }}
      >
        <span style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 220, lineHeight: 1.5 }}>
          {t("rightSidebar.empty.noProject")}
        </span>
      </div>
    );
  }

  return (
    <>
      {fileTabs.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0, background: "var(--bg-panel)", borderBottom: "1px solid var(--border)", height: 36 }}>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <TabBar
              tabs={fileTabs}
              activeTabId={activeFileTabId ?? ""}
              onSelectTab={onSelectFileTab}
              onCloseTab={onCloseFileTab}
            />
          </div>
        </div>
      )}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {activeFileTab?.filePath ? (
          <FileViewer
            filePath={activeFileTab.filePath}
            cwd={selectedCwd}
            sourceSessionId={activeFileTab.sourceSessionId ?? sourceSessionId ?? null}
            gitRefreshKey={explorerRefreshKey}
            onMentionLines={onMentionLines}
            onOpenFile={(filePath) => onOpenFile(filePath, filePath.split("/").pop() || filePath)}
          />
        ) : (
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, overflow: "auto" }}>
              <FileExplorer
                ref={fileExplorerRef}
                cwd={selectedCwd}
                onOpenFile={onOpenFile}
                refreshKey={explorerRefreshKey}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
