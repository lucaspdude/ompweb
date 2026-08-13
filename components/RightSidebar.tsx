"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { FileExplorer, type FileExplorerHandle } from "./FileExplorer";
import { FileViewer } from "./FileViewer";
import type { Tab } from "./TabBar";
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
    setCustomWidth(null);
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

  // Free-drag width: when the user drags the sidebar's left edge we
  // switch to a custom pixel width (within bounds) so the column can
  // be sized freely instead of snapping to the three discrete states.
  // The custom width persists in localStorage; clicking a rail tab
  // resets it back to the rail's discrete state.
  const [customWidth, setCustomWidth] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem("rocinante:right-sidebar-custom-width");
      if (stored) {
        const n = Number.parseInt(stored, 10);
        if (Number.isFinite(n) && n >= 200 && n <= 1200) setCustomWidth(n);
      }
    } catch { /* ignore */ }
  }, []);

  // The width of the sidebar in pixels. Collapses to the rail-only
  // 44px when closed; otherwise prefers the user's drag-resized
  // customWidth (if any) over the discrete widthState.
  const width = open
    ? (customWidth != null ? customWidth : WIDTH_BY_STATE[widthState])
    : WIDTH_BY_STATE.collapsed;

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (isMobile) return;
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    setIsDragging(true);
    const onMove = (ev: MouseEvent) => {
      // The sidebar grows to the LEFT of the drag handle, so a
      // decreasing clientX means a wider sidebar.
      const next = Math.min(1200, Math.max(200, startWidth - (ev.clientX - startX)));
      setCustomWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setIsDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [isMobile, width]);

  const activeFileTab = fileTabs.find((t) => t.id === activeFileTabId) ?? null;
  // The content panel is visible whenever the sidebar is open AND not
  // collapsed to the rail-only state.
  const showContent = open && widthState !== "collapsed";

  return (
    <aside
      className="right-sidebar-container"
      data-state={widthState}
      data-tab={activeTab}
      data-open={open ? "true" : "false"}
      style={{
        position: "relative",
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
      <div
        onMouseDown={handleResizeStart}
        title={t("rightSidebar.resize")}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 5,
          cursor: isMobile ? "default" : "col-resize",
          zIndex: 5,
          background: isDragging ? "var(--accent)" : "transparent",
          transition: "background var(--dur-fast) var(--ease-out-warm)",
        }}
      />
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

  const showFile = !!activeFileTab?.filePath;
  return (
    <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "row", minHeight: 0 }}>
      {/*
        When a file is open, render the file tree and the file viewer
        side by side so the user can see both at once. The previous
        design showed only the viewer (hiding the tree), which the
        user reported as a UX gap. With no file open, the tree fills
        the whole space.

        The FileViewer has its own internal header (file name +
        markdown/source/Pré-visualização + download), so we do not
        add a separate TabBar above the viewer — the file name
        already lives inside the viewer's own header. The previous
        design duplicated the file name in a TabBar above the
        viewer, which the user flagged as a visual clash.

        The tree column is now a fixed 220px (with min 160 / max
        280) instead of a 35% percentage. At the default 560px
        sidebar, 35% was 196px which made the file path column
        cramped. 220px strikes a balance: enough to read the
        longest folder name without truncation, leaving the viewer
        with the majority of the horizontal real estate.
       */}
      {showFile && (
        <div style={{ flex: "0 0 220px", minWidth: 160, maxWidth: 280, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
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
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {showFile ? (
          <FileViewer
            filePath={activeFileTab!.filePath!}
            cwd={selectedCwd}
            sourceSessionId={activeFileTab!.sourceSessionId ?? sourceSessionId ?? null}
            gitRefreshKey={explorerRefreshKey}
            onMentionLines={onMentionLines}
            onOpenFile={(filePath) => onOpenFile(filePath, filePath.split("/").pop() || filePath)}
          />
        ) : (
          <div style={{ flex: 1, overflow: "auto" }}>
            <FileExplorer
              ref={fileExplorerRef}
              cwd={selectedCwd}
              onOpenFile={onOpenFile}
              refreshKey={explorerRefreshKey}
            />
          </div>
        )}
      </div>
    </div>
  );
}
