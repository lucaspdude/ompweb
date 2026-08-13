"use client";

import { forwardRef, useState, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import {
  AtSign,
  Check,
  ChevronRight,
  CircleAlert,
  CircleMinus,
  Copy,
  Download,
  Folder,
  FolderOpen,
  Loader2,
  RefreshCw,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { getFileIcon } from "./FileIcons";
import { Tooltip } from "./ui/primitives";
import { ConfirmDialog, TextInput } from "./ui/field";
import { Dialog, DialogContent, DialogTitle } from "./ui/primitives";
import { translate, useI18n } from "@/lib/i18n";
import {
  encodeFilePathForApi,
  getFileDirectory,
  getRelativeFilePath,
  joinFilePath,
  normalizeFilePathSlashes,
} from "@/lib/file-paths";
import type { GitFileStatus, GitFileStatusKind, GitStatusResponse } from "@/lib/git-types";
import { copyText } from "@/lib/clipboard";
import { toast } from "./ui/toast";
import { ContextMenuContent, ContextMenuItem, ContextMenuRoot, ContextMenuTrigger } from "./ui/context-menu";

interface FileEntry {
  name: string;
  isDir: boolean;
  size: number;
  modified: string;
}

interface FileNode {
  name: string;
  fullPath: string;
  isDir: boolean;
  size: number;
  children?: FileNode[];
  loaded?: boolean;
}

interface Props {
  cwd: string;
  onOpenFile: (filePath: string, fileName: string) => void;
  refreshKey?: number;
  onAtMention?: (relativePath: string, isDir: boolean) => void;
  onAtMentions?: (relativePaths: string[]) => void;
  onUploadBusyChange?: (busy: boolean) => void;
  onRefreshDone?: () => void;
}

export interface FileExplorerHandle {
  openUploadPicker: () => void;
}

type UploadPhase = "idle" | "checking" | "uploading";
type UploadConflictStrategy = "error" | "overwrite" | "skip";

interface UploadError {
  name: string;
  error: string;
}

interface UploadResponse {
  uploaded?: string[];
  skipped?: string[];
  errors?: UploadError[];
  conflicts?: string[];
  nonReplaceable?: string[];
  error?: string;
}

interface UploadSummary {
  uploaded: string[];
  skipped: string[];
  errors: UploadError[];
}

interface PendingConflict {
  files: File[];
  conflicts: string[];
  nonReplaceable: string[];
}

async function fetchEntries(dirPath: string): Promise<FileNode[]> {
  const encoded = encodeFilePathForApi(dirPath);
  const res = await fetch(`/api/files/${encoded}?type=list`);
  if (!res.ok) {
    let message = translate("fileExplorer.loadFailed", { status: res.status });
    try {
      const data = await res.json() as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(message);
  }
  const data = await res.json() as { entries?: FileEntry[] };
  return (data.entries ?? []).map((e) => ({
    name: e.name,
    fullPath: joinFilePath(dirPath, e.name),
    isDir: e.isDir,
    size: e.size,
    children: e.isDir ? [] : undefined,
    loaded: !e.isDir,
  }));
}

async function fetchGitStatus(cwd: string): Promise<GitStatusResponse> {
  const params = new URLSearchParams({ cwd });
  const res = await fetch(`/api/git/status?${params.toString()}`);
  if (!res.ok) throw new Error(translate("fileExplorer.gitStatusFailed", { status: res.status }));
  return res.json() as Promise<GitStatusResponse>;
}

const GIT_STATUS_LABEL_KEYS: Record<GitFileStatusKind, string> = {
  modified: "fileExplorer.gitModified",
  added: "fileExplorer.gitAdded",
  deleted: "fileExplorer.gitDeleted",
  renamed: "fileExplorer.gitRenamed",
  untracked: "fileExplorer.gitUntracked",
  conflict: "fileExplorer.gitConflict",
};

const GIT_STATUS_COLORS: Record<GitFileStatusKind, string> = {
  modified: "var(--status-modified)",
  added: "var(--status-success)",
  deleted: "var(--status-error)",
  renamed: "var(--status-renamed)",
  untracked: "var(--status-success)",
  conflict: "var(--status-error)",
};

function uploadFiles(
  targetDirectory: string,
  files: File[],
  strategy: UploadConflictStrategy,
  onProgress: (progress: number) => void,
): Promise<{ status: number; data: UploadResponse }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file, file.name));

    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `/api/files/${encodeFilePathForApi(targetDirectory)}?type=upload&conflict=${strategy}`,
    );
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onerror = () => reject(new Error(translate("fileExplorer.uploadNetworkError")));
    xhr.onabort = () => reject(new Error(translate("fileExplorer.uploadCancelled")));
    xhr.onload = () => {
      let data: UploadResponse = {};
      try {
        data = JSON.parse(xhr.responseText) as UploadResponse;
      } catch {
        if (xhr.responseText) data.error = xhr.responseText;
      }
      resolve({ status: xhr.status, data });
    };
    xhr.send(formData);
  });
}

function DismissButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: 24, height: 24, padding: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, border: "none",
        borderRadius: "var(--radius-control)",
        background: "none",
        color: "var(--text-dim)",
        cursor: "pointer",
        transition: `background var(--dur-fast) var(--ease-out-warm), color var(--dur-fast) var(--ease-out-warm)`,
      }}
      onMouseEnter={(event) => { event.currentTarget.style.color = "var(--text-muted)"; event.currentTarget.style.background = "var(--bg-hover)"; }}
      onMouseLeave={(event) => { event.currentTarget.style.color = "var(--text-dim)"; event.currentTarget.style.background = "none"; }}
    >
      <X size={13} strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
}

function TreeNode({
  node,
  depth,
  cwd,
  onOpenFile,
  onAtMention,
  expandedPaths,
  onToggleExpanded,
  refreshToken,
  highlightedPaths,
  gitStatusByPath,
  changedDirectoryPaths,
  onRequestDelete,
  onRequestRename,
}: {
  node: FileNode;
  depth: number;
  cwd: string;
  onOpenFile: (filePath: string, fileName: string) => void;
  onAtMention?: (relativePath: string, isDir: boolean) => void;
  expandedPaths: Set<string>;
  onToggleExpanded: (fullPath: string, open: boolean) => void;
  refreshToken: string;
  highlightedPaths: Set<string>;
  gitStatusByPath: Map<string, GitFileStatus>;
  changedDirectoryPaths: Set<string>;
  onRequestDelete?: (path: string, name: string, isDir: boolean) => void;
  onRequestRename?: (path: string, name: string) => void;
}) {
  const { t } = useI18n();
  const open = expandedPaths.has(node.fullPath);
  const highlighted = highlightedPaths.has(node.fullPath);
  const normalizedPath = normalizeFilePathSlashes(node.fullPath);
  const gitStatus = gitStatusByPath.get(normalizedPath);
  const containsGitChanges = node.isDir && (
    gitStatus !== undefined || changedDirectoryPaths.has(normalizedPath)
  );
  const [children, setChildren] = useState<FileNode[]>(node.children ?? []);
  const [loaded, setLoaded] = useState(node.loaded ?? false);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(false);

  const loadChildren = useCallback(async (force = false) => {
    if (loaded && !force) return;
    setLoading(true);
    try {
      const entries = await fetchEntries(node.fullPath);
      setChildren(entries);
      setLoaded(true);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [loaded, node.fullPath]);

  // Re-fetch children when the tree refreshes. Open directories re-fetch in
  // place; collapsed directories are marked stale so the next expand re-fetches
  // instead of showing a listing captured before the refresh.
  useEffect(() => {
    if (open) {
      if (loaded) loadChildren(true);
    } else {
      setLoaded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const handleClick = useCallback(() => {
    if (node.isDir) {
      const next = !open;
      onToggleExpanded(node.fullPath, next);
      if (next && !loaded) loadChildren();
    } else {
      onOpenFile(node.fullPath, node.name);
    }
  }, [node.isDir, node.fullPath, node.name, loaded, open, loadChildren, onOpenFile, onToggleExpanded]);

  const mentionLabel = t("fileExplorer.insertPathIntoChat");
  const downloadLabel = t("fileExplorer.downloadFile");
  const copyNameLabel = t("rightSidebar.contextMenu.copyName");
  const copyPathLabel = t("rightSidebar.contextMenu.copyPath");
  const copyRelativePathLabel = t("rightSidebar.contextMenu.copyRelativePath");
  const refreshLabel = t("rightSidebar.contextMenu.refresh");
  const renameLabel = t("rightSidebar.contextMenu.rename");
  const deleteLabel = t("rightSidebar.contextMenu.delete");
  const handleCopyName = useCallback(() => { void copyText(node.name); }, [node.name]);
  const handleCopyPath = useCallback(() => { void copyText(node.fullPath); }, [node.fullPath]);
  const handleCopyRelative = useCallback(() => { void copyText(getRelativeFilePath(node.fullPath, cwd)); }, [node.fullPath, cwd]);
  const handleRefresh = useCallback(() => { void loadChildren(true); toast.info(t("rightSidebar.contextMenu.refreshDone")); }, [loadChildren, t]);
  const handleDelete = useCallback(() => { onRequestDelete?.(node.fullPath, node.name, node.isDir); }, [onRequestDelete, node.fullPath, node.name, node.isDir]);
  const handleRename = useCallback(() => { onRequestRename?.(node.fullPath, node.name); }, [onRequestRename, node.fullPath, node.name]);

  return (
    <ContextMenuRoot>
      <ContextMenuTrigger>
        <div
          onClick={handleClick}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 4,
            paddingLeft: 8 + depth * 14,
            paddingRight: 8,
            height: 24,
            cursor: "pointer",
            background: hovered ? "var(--bg-hover)" : "transparent",
            borderRadius: "var(--radius-control)",
            userSelect: "none",
            transition: `background var(--dur-fast) var(--ease-out-warm)`,
          }}
        >
        {node.isDir && (
          <ChevronRight
            size={10}
            strokeWidth={2}
            color="var(--text-dim)"
            style={{
              flexShrink: 0,
              transform: open ? "rotate(90deg)" : "none",
              transition: `transform var(--dur-fast) var(--ease-out-warm)`,
            }}
            aria-hidden="true"
          />
        )}
        {!node.isDir && <span style={{ width: 10, flexShrink: 0 }} />}
        <span style={{ flexShrink: 0, display: "flex", alignItems: "center", color: node.isDir ? "var(--text-muted)" : "var(--text-dim)" }}>
          {node.isDir ? (
            open ? <FolderOpen size={14} strokeWidth={1.8} aria-hidden="true" /> : <Folder size={14} strokeWidth={1.8} aria-hidden="true" />
          ) : (
            getFileIcon(node.name, 14)
          )}
        </span>
        <span
          style={{
            fontSize: 12,
            color: "var(--text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
          title={node.fullPath}
        >
          {node.name}
        </span>
        {highlighted && (
          <span
            title={t("fileExplorer.newlyUploaded")}
            aria-label={t("fileExplorer.newlyUploaded")}
            style={{ width: 6, height: 6, flexShrink: 0, borderRadius: "50%", background: "var(--accent)" }}
          />
        )}
        {!hovered && !node.isDir && gitStatus && (
          <span
            title={t(GIT_STATUS_LABEL_KEYS[gitStatus.status])}
            aria-label={t(GIT_STATUS_LABEL_KEYS[gitStatus.status])}
            style={{
              width: 14,
              flexShrink: 0,
              color: GIT_STATUS_COLORS[gitStatus.status],
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            {gitStatus.code}
          </span>
        )}
        {!hovered && containsGitChanges && (
          <span
            title={t("fileExplorer.containsChangedFiles")}
            aria-label={t("fileExplorer.containsChangedFiles")}
            style={{
              width: 6,
              height: 6,
              flexShrink: 0,
              borderRadius: "50%",
              background: "var(--status-modified)",
            }}
          />
        )}
        {loading && (
          <Loader2 size={10} strokeWidth={2} color="var(--text-dim)" style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }} aria-hidden="true" />
        )}
        {onAtMention && hovered && (
          <Tooltip content={mentionLabel}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAtMention(getRelativeFilePath(node.fullPath, cwd), node.isDir);
              }}
              aria-label={mentionLabel}
              style={{
                position: "absolute",
                right: !node.isDir ? 28 : 4,
                top: "50%",
                transform: "translateY(-50%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: "0 8px",
                height: 20,
                background: "var(--bg-panel)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-control)",
                color: "var(--accent)",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                whiteSpace: "nowrap",
                transition: `background var(--dur-fast) var(--ease-out-warm), color var(--dur-fast) var(--ease-out-warm)`,
              }}
            >
              <AtSign size={11} strokeWidth={2.2} aria-hidden="true" />
              {t("fileExplorer.mention")}
            </button>
          </Tooltip>
        )}
        {hovered && !node.isDir && (
          <Tooltip content={downloadLabel}>
            <a
              href={`/api/files/${encodeFilePathForApi(node.fullPath)}?type=download`}
              download
              onClick={(e) => e.stopPropagation()}
              aria-label={downloadLabel}
              style={{
                position: "absolute",
                right: 4,
                top: "50%",
                transform: "translateY(-50%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: "0 5px",
                height: 20,
                background: "var(--bg-panel)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-control)",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                whiteSpace: "nowrap",
                textDecoration: "none",
                transition: `background var(--dur-fast) var(--ease-out-warm), color var(--dur-fast) var(--ease-out-warm)`,
              }}
            >
              <Download size={11} strokeWidth={2.2} aria-hidden="true" />
            </a>
          </Tooltip>
        )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem label={copyNameLabel} onClick={handleCopyName} />
        <ContextMenuItem label={copyPathLabel} onClick={handleCopyPath} />
        <ContextMenuItem label={copyRelativePathLabel} onClick={handleCopyRelative} />
        {!node.isDir && (
          <ContextMenuItem
            label={downloadLabel}
            onClick={() => {
              const a = document.createElement("a");
              a.href = `/api/files/${encodeFilePathForApi(node.fullPath)}?type=download`;
              a.download = node.name;
              a.click();
            }}
          />
        )}
        <ContextMenuItem label={refreshLabel} onClick={handleRefresh} />
        <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} aria-hidden="true" />
        {onRequestRename && <ContextMenuItem label={renameLabel} onClick={handleRename} />}
        {onRequestDelete && <ContextMenuItem label={deleteLabel} onClick={handleDelete} />}
      </ContextMenuContent>
      {node.isDir && open && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.fullPath}
              node={child}
              depth={depth + 1}
              cwd={cwd}
              onOpenFile={onOpenFile}
              onAtMention={onAtMention}
              expandedPaths={expandedPaths}
              onToggleExpanded={onToggleExpanded}
              refreshToken={refreshToken}
              highlightedPaths={highlightedPaths}
              gitStatusByPath={gitStatusByPath}
              changedDirectoryPaths={changedDirectoryPaths}
              onRequestDelete={onRequestDelete}
              onRequestRename={onRequestRename}
            />
          ))}
          {children.length === 0 && loaded && (
            <div style={{ paddingLeft: 8 + (depth + 1) * 14, fontSize: 11, color: "var(--text-dim)", height: 22, display: "flex", alignItems: "center" }}>
              {t("fileExplorer.emptyDir")}
            </div>
          )}
        </div>
      )}
    </ContextMenuRoot>
  );
}

export const FileExplorer = forwardRef<FileExplorerHandle, Props>(function FileExplorer({
  cwd,
  onOpenFile,
  refreshKey,
  onAtMention,
  onAtMentions,
  onUploadBusyChange,
  onRefreshDone,
}, ref) {
  const { t, tn } = useI18n();
  const [roots, setRoots] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const [highlightedPaths, setHighlightedPaths] = useState<Set<string>>(new Set());
  const [gitFiles, setGitFiles] = useState<GitFileStatus[]>([]);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);
  const [pendingConflict, setPendingConflict] = useState<PendingConflict | null>(null);
  const prevCwdRef = useRef<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const refreshToken = `${refreshKey ?? 0}:${treeRefreshKey}`;
  // Phase 1.5: delete + rename state for the TreeNode context menu.
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string; isDir: boolean } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ path: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const handleRequestDelete = useCallback((path: string, name: string, isDir: boolean) => {
    setDeleteTarget({ path, name, isDir });
  }, []);

  const handleRequestRename = useCallback((path: string, name: string) => {
    setRenameTarget({ path, name });
    setRenameValue(name);
    setRenameError(null);
  }, []);

  const refreshAfterMutation = useCallback(() => {
    setTreeRefreshKey((k) => k + 1);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const url = `/api/files/${encodeFilePathForApi(deleteTarget.path)}${deleteTarget.isDir ? "?recursive=true" : ""}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = typeof body?.error === "string" ? body.error : `HTTP ${res.status}`;
        toast.error(translate("rightSidebar.deleteFailed", { error: msg }));
        return;
      }
      toast.success(translate("fileExplorer.deleteDone", { name: deleteTarget.name }));
      setDeleteTarget(null);
      refreshAfterMutation();
    } catch (e) {
      toast.error(translate("rightSidebar.deleteFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, refreshAfterMutation]);

  const handleConfirmRename = useCallback(async () => {
    if (!renameTarget) return;
    const newName = renameValue.trim();
    if (!newName || newName === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    setRenameBusy(true);
    setRenameError(null);
    try {
      const res = await fetch(`/api/files/${encodeFilePathForApi(renameTarget.path)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = typeof body?.error === "string" ? body.error : `HTTP ${res.status}`;
        setRenameError(msg);
        return;
      }
      toast.success(translate("fileExplorer.renameDone", { name: newName }));
      setRenameTarget(null);
      refreshAfterMutation();
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : String(e));
    } finally {
      setRenameBusy(false);
    }
  }, [renameTarget, renameValue, refreshAfterMutation]);
  const uploadBusy = uploadPhase !== "idle";

  const gitStatusByPath = useMemo(() => new Map(
    gitFiles.map((status) => [normalizeFilePathSlashes(status.filePath), status]),
  ), [gitFiles]);

  const changedDirectoryPaths = useMemo(() => {
    const directories = new Set<string>();
    const normalizedCwd = normalizeFilePathSlashes(cwd).replace(/\/$/, "");
    for (const status of gitFiles) {
      let directory = getFileDirectory(normalizeFilePathSlashes(status.filePath));
      while (directory === normalizedCwd || directory.startsWith(`${normalizedCwd}/`)) {
        directories.add(directory);
        if (directory === normalizedCwd) break;
        const parent = getFileDirectory(directory);
        if (parent === directory) break;
        directory = parent;
      }
    }
    return directories;
  }, [cwd, gitFiles]);

  const handleToggleExpanded = useCallback((fullPath: string, open: boolean) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (open) next.add(fullPath); else next.delete(fullPath);
      return next;
    });
  }, []);

  const applyUploadResult = useCallback((data: UploadResponse) => {
    const uploaded = data.uploaded ?? [];
    const skipped = data.skipped ?? [];
    const errors = data.errors ?? [];
    setUploadSummary({ uploaded, skipped, errors });

    if (uploaded.length > 0) {
      setHighlightedPaths(new Set(uploaded.map((name) => joinFilePath(cwd, name))));
      setTreeRefreshKey((key) => key + 1);
    }
  }, [cwd]);

  const performUpload = useCallback(async (
    files: File[],
    strategy: UploadConflictStrategy,
  ) => {
    setPendingConflict(null);
    setUploadError(null);
    setUploadProgress(0);
    setUploadPhase("uploading");

    try {
      const { status, data } = await uploadFiles(cwd, files, strategy, setUploadProgress);
      if (status === 409 && data.conflicts?.length) {
        setPendingConflict({
          files,
          conflicts: data.conflicts,
          nonReplaceable: data.nonReplaceable ?? [],
        });
        return;
      }
      if (status < 200 || status >= 300) {
        throw new Error(data.error ?? translate("fileExplorer.uploadFailed", { status }));
      }
      setUploadProgress(100);
      applyUploadResult(data);
    } catch (uploadFailure) {
      setUploadError(uploadFailure instanceof Error ? uploadFailure.message : String(uploadFailure));
    } finally {
      setUploadPhase("idle");
    }
  }, [applyUploadResult, cwd]);

  const prepareUpload = useCallback(async (files: File[]) => {
    if (files.length === 0 || uploadBusy) return;
    setUploadSummary(null);
    setHighlightedPaths(new Set());
    setPendingConflict(null);
    setUploadError(null);
    setUploadProgress(0);
    setUploadPhase("checking");

    try {
      const res = await fetch(
        `/api/files/${encodeFilePathForApi(cwd)}?type=upload-check`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileNames: files.map((file) => file.name) }),
        },
      );
      const data = await res.json().catch(() => ({})) as UploadResponse;
      if (!res.ok) throw new Error(data.error ?? translate("fileExplorer.uploadCheckFailed", { status: res.status }));

      if (data.conflicts?.length) {
        setPendingConflict({
          files,
          conflicts: data.conflicts,
          nonReplaceable: data.nonReplaceable ?? [],
        });
        return;
      }

      await performUpload(files, "error");
    } catch (uploadFailure) {
      setUploadError(uploadFailure instanceof Error ? uploadFailure.message : String(uploadFailure));
    } finally {
      setUploadPhase("idle");
    }
  }, [cwd, performUpload, uploadBusy]);

  const handleUploadInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void prepareUpload(files);
  }, [prepareUpload]);

  useImperativeHandle(ref, () => ({
    openUploadPicker() {
      if (!uploadBusy) uploadInputRef.current?.click();
    },
  }), [uploadBusy]);

  useEffect(() => {
    onUploadBusyChange?.(uploadBusy);
  }, [onUploadBusyChange, uploadBusy]);

  useEffect(() => () => onUploadBusyChange?.(false), [onUploadBusyChange]);

  // Keep the refresh-done callback in a ref so its identity cannot re-trigger
  // the fetch effect below (AppShell re-renders on every session boundary).
  const onRefreshDoneRef = useRef(onRefreshDone);
  onRefreshDoneRef.current = onRefreshDone;

  useEffect(() => {
    const cwdChanged = prevCwdRef.current !== cwd;
    prevCwdRef.current = cwd;

    // Reset expanded state only when cwd changes, not on refreshKey bumps
    if (cwdChanged) {
      setExpandedPaths(new Set());
      setHighlightedPaths(new Set());
      setUploadSummary(null);
      setPendingConflict(null);
      setUploadError(null);
    }

    setLoading(cwdChanged);
    setError(null);
    let cancelled = false;
    fetchEntries(cwd)
      .then((entries) => { if (!cancelled) setRoots(entries); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); onRefreshDoneRef.current?.(); });
    return () => { cancelled = true; };
  }, [cwd, refreshKey, treeRefreshKey]);

  useEffect(() => {
    let cancelled = false;
    fetchGitStatus(cwd)
      .then((status) => {
        if (!cancelled) setGitFiles(status.isGitRepository ? status.files : []);
      })
      .catch(() => {
        if (!cancelled) setGitFiles([]);
      });
    return () => { cancelled = true; };
  }, [cwd, refreshKey, treeRefreshKey]);

  const showUploadFeedback = uploadBusy || pendingConflict !== null || uploadError !== null || uploadSummary !== null;

  const addUploadedFilesToChat = useCallback(() => {
    if (!uploadSummary || uploadSummary.uploaded.length === 0) return;
    onAtMentions?.(
      uploadSummary.uploaded.map((name) => getRelativeFilePath(joinFilePath(cwd, name), cwd)),
    );
  }, [cwd, onAtMentions, uploadSummary]);

  return (
    <div style={{ minHeight: "100%" }}>
      <input ref={uploadInputRef} type="file" multiple hidden onChange={handleUploadInput} />
      {showUploadFeedback && (
        <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>
        {uploadBusy && (
          <div role="status" aria-live="polite" aria-label={uploadPhase === "checking" ? t("fileExplorer.checkingFiles") : t("fileExplorer.uploadingPercent", { percent: uploadProgress })}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 14, color: "var(--text-muted)" }}>
              {uploadPhase === "checking" ? (
                <Loader2 size={13} strokeWidth={2.2} style={{ animation: "spin 0.8s linear infinite" }} aria-hidden="true" />
              ) : (
                <Upload size={13} strokeWidth={2} aria-hidden="true" />
              )}
              {uploadPhase === "uploading" && <span style={{ fontSize: 10 }}>{uploadProgress}%</span>}
            </div>
            {uploadPhase === "uploading" && (
              <div style={{ height: 3, marginTop: 4, overflow: "hidden", borderRadius: 2, background: "var(--border)" }}>
                <div style={{ width: `${uploadProgress}%`, height: "100%", background: "var(--text-muted)", transition: `width var(--dur-fast) var(--ease-out-warm)` }} />
              </div>
            )}
          </div>
        )}

        {pendingConflict && (
          <div role="alert" style={{ padding: 7, border: "1px solid color-mix(in srgb, var(--status-warning) 55%, var(--border))", borderRadius: 4, background: "color-mix(in srgb, var(--status-warning) 9%, var(--bg-panel))" }}>
            <div style={{ fontSize: 11, color: "var(--text)", lineHeight: 1.35, overflowWrap: "anywhere" }}>
              {tn("fileExplorer.filesAlreadyExist", pendingConflict.conflicts.length, { files: pendingConflict.conflicts.join(", ") })}
            </div>
            {pendingConflict.nonReplaceable.length > 0 && (
              <div style={{ marginTop: 3, fontSize: 10, color: "var(--status-warning)", lineHeight: 1.35, overflowWrap: "anywhere" }}>
                {t("fileExplorer.cannotReplace", { files: pendingConflict.nonReplaceable.join(", ") })}
              </div>
            )}
            <div style={{ display: "flex", gap: 5, marginTop: 7 }}>
              <button type="button" onClick={() => void performUpload(pendingConflict.files, "overwrite")} style={{ height: 22, padding: "0 7px", border: "1px solid var(--status-error)", borderRadius: "var(--radius-control)", background: "transparent", color: "var(--status-error)", cursor: "pointer", fontSize: 10 }}>
                {t("fileExplorer.replace")}
              </button>
              <button type="button" onClick={() => void performUpload(pendingConflict.files, "skip")} style={{ height: 22, padding: "0 7px", border: "1px solid var(--border)", borderRadius: "var(--radius-control)", background: "var(--bg-panel)", color: "var(--text)", cursor: "pointer", fontSize: 10 }}>
                {t("fileExplorer.skipExisting")}
              </button>
              <button type="button" onClick={() => setPendingConflict(null)} style={{ height: 22, padding: "0 7px", border: "none", borderRadius: "var(--radius-control)", background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontSize: 10 }}>
                {t("fileExplorer.cancel")}
              </button>
            </div>
          </div>
        )}

        {uploadError && (
          <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11, lineHeight: 1.35, color: "var(--status-error)" }}>
            <span style={{ minWidth: 0, flex: 1, overflowWrap: "anywhere" }}>{uploadError}</span>
            <DismissButton onClick={() => setUploadError(null)} title={t("fileExplorer.dismissError")} />
          </div>
        )}

        {uploadSummary && (
          <div aria-live="polite">
            <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 22, fontSize: 11 }}>
              <div style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                {uploadSummary.uploaded.length > 0 && (
                  <span title={t("fileExplorer.uploadedCount", { count: uploadSummary.uploaded.length })} aria-label={t("fileExplorer.uploadedCount", { count: uploadSummary.uploaded.length })} style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--status-success)" }}>
                    <Check size={13} strokeWidth={2.4} aria-hidden="true" />
                    <span>{uploadSummary.uploaded.length}</span>
                  </span>
                )}
                {uploadSummary.skipped.length > 0 && (
                  <span title={t("fileExplorer.skippedCount", { count: uploadSummary.skipped.length })} aria-label={t("fileExplorer.skippedCount", { count: uploadSummary.skipped.length })} style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--text-dim)" }}>
                    <CircleMinus size={13} strokeWidth={2} aria-hidden="true" />
                    <span>{uploadSummary.skipped.length}</span>
                  </span>
                )}
                {uploadSummary.errors.length > 0 && (
                  <span title={t("fileExplorer.failedCount", { count: uploadSummary.errors.length })} aria-label={t("fileExplorer.failedCount", { count: uploadSummary.errors.length })} style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--status-error)" }}>
                    <TriangleAlert size={13} strokeWidth={2} aria-hidden="true" />
                    <span>{uploadSummary.errors.length}</span>
                  </span>
                )}
              </div>
              {uploadSummary.uploaded.length > 0 && onAtMentions && (
                <Tooltip content={uploadSummary.uploaded.length === 1 ? t("fileExplorer.addUploadedFile") : t("fileExplorer.addAllUploadedFiles")}>
                  <button
                    type="button"
                    onClick={addUploadedFilesToChat}
                    aria-label={uploadSummary.uploaded.length === 1 ? t("fileExplorer.addUploadedFile") : t("fileExplorer.addAllUploadedFiles")}
                    style={{
                      height: 22, padding: "0 7px",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                      flexShrink: 0,
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-control)",
                      background: "var(--bg-panel)",
                      color: "var(--accent)",
                      cursor: "pointer", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
                      transition: `background var(--dur-fast) var(--ease-out-warm), border-color var(--dur-fast) var(--ease-out-warm)`,
                    }}
                  >
                    <AtSign size={11} strokeWidth={2.2} aria-hidden="true" />
                    {t("fileExplorer.mention")}
                  </button>
                </Tooltip>
              )}
              <DismissButton onClick={() => setUploadSummary(null)} title={t("fileExplorer.dismissUploadResults")} />
            </div>
            {uploadSummary.errors.map((item) => (
              <div key={item.name} title={item.error} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, minWidth: 0, fontSize: 10, color: "var(--status-error)" }}>
                <CircleAlert size={11} strokeWidth={2} style={{ flexShrink: 0 }} aria-hidden="true" />
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
              </div>
            ))}
          </div>
        )}
        </div>
      )}

      <div style={{ padding: "2px 4px" }}>
        {loading ? (
          <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-dim)" }}>{t("fileExplorer.loadingFiles")}</div>
        ) : error ? (
          <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--status-error)" }}>{error}</div>
        ) : (
          roots.map((node) => (
            <TreeNode
              key={node.fullPath}
              node={node}
              depth={0}
              cwd={cwd}
              onOpenFile={onOpenFile}
              onAtMention={onAtMention}
              expandedPaths={expandedPaths}
              onToggleExpanded={handleToggleExpanded}
              refreshToken={refreshToken}
              highlightedPaths={highlightedPaths}
              gitStatusByPath={gitStatusByPath}
              changedDirectoryPaths={changedDirectoryPaths}
              onRequestDelete={handleRequestDelete}
              onRequestRename={handleRequestRename}
            />
          ))
        )}
        {!loading && !error && roots.length === 0 && (
          <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-dim)" }}>
            {t("fileExplorer.noFilesFound")}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={translate("rightSidebar.deleteConfirm.title")}
        description={deleteTarget?.isDir
          ? translate("rightSidebar.deleteConfirm.recursive", { name: deleteTarget.name })
          : translate("rightSidebar.deleteConfirm.body", { name: deleteTarget?.name ?? "" })}
        confirmLabel={translate("common.delete")}
        cancelLabel={translate("common.cancel")}
        danger
        busy={deleteBusy}
        onConfirm={handleConfirmDelete}
      />

      <Dialog open={renameTarget !== null} onOpenChange={(open) => { if (!open) setRenameTarget(null); }}>
        <DialogContent
          ariaLabel={translate("rightSidebar.contextMenu.rename")}
          style={{ width: 420, maxWidth: "min(92vw, 420px)", padding: 22 }}
        >
          <DialogTitle>{translate("rightSidebar.contextMenu.rename")}</DialogTitle>
          <div style={{ height: 8 }} />
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--text-muted)" }}>
            {renameTarget?.path}
          </p>
          <TextInput
            value={renameValue}
            onChange={(v) => { setRenameValue(v); setRenameError(null); }}
            placeholder={translate("rightSidebar.renamePrompt")}
            error={renameError}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleConfirmRename();
              if (e.key === "Escape") setRenameTarget(null);
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
            <button
              type="button"
              onClick={() => setRenameTarget(null)}
              style={{ padding: "6px 14px", background: "none", border: "1px solid var(--border)", borderRadius: "var(--radius-control)", color: "var(--text-muted)", cursor: "pointer", fontSize: 13 }}
            >
              {translate("common.cancel")}
            </button>
            <button
              type="button"
              disabled={renameBusy}
              onClick={() => void handleConfirmRename()}
              style={{ padding: "6px 14px", background: "var(--accent)", border: "none", borderRadius: "var(--radius-control)", color: "white", cursor: renameBusy ? "wait" : "pointer", fontSize: 13, fontWeight: 600, opacity: renameBusy ? 0.7 : 1 }}
            >
              {translate("common.save")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});
