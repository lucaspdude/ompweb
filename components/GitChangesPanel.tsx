"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Folder, FolderOpen, Loader2, RefreshCw } from "lucide-react";
import { translate, useI18n } from "@/lib/i18n";
import { getFileIcon } from "./FileIcons";
import { Tooltip } from "./ui/primitives";
import { getFileName, getRelativeFilePath } from "@/lib/file-paths";
import type { GitFileStatus, GitFileStatusKind } from "@/lib/git-types";

interface Repository {
  root: string;
  relativeRoot: string;
  name: string;
  fileCount: number;
  counts: {
    modified: number;
    added: number;
    deleted: number;
    renamed: number;
    untracked: number;
    conflict: number;
  };
  files: GitFileStatus[];
}

interface ScanResult {
  cwd: string;
  repositories: Repository[];
}

const STATUS_LABEL: Record<GitFileStatusKind, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  untracked: "U",
  conflict: "C",
};

const STATUS_COLOR: Record<GitFileStatusKind, string> = {
  modified: "var(--text-muted)",
  added: "#2da44e",
  deleted: "#cf222e",
  renamed: "#0969da",
  untracked: "#6e7781",
  conflict: "#bc4c00",
};

interface Props {
  cwd: string | null;
  onOpenFile?: (filePath: string, fileName: string) => void;
  onChangesCount?: (count: number) => void;
}

export function GitChangesPanel({ cwd, onOpenFile, onChangesCount }: Props) {
  const { t } = useI18n();
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/git/repos?cwd=${encodeURIComponent(target)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json() as ScanResult;
      setScan(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setScan(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!cwd) {
      setScan(null);
      return;
    }
    void load(cwd);
  }, [cwd, load]);

  // Report the total file count to the parent whenever the scan settles.
  // MUST stay above any early return — React requires hooks to be called
  // in the same order on every render. The original Phase 1 code placed
  // this useEffect after the early returns, which threw "Rendered fewer
  // hooks than expected" on the first scan error.
  const repos = scan?.repositories ?? [];
  const totalCount = repos.reduce((sum, r) => sum + r.fileCount, 0);
  useEffect(() => {
    onChangesCount?.(totalCount);
  }, [totalCount, onChangesCount]);

  if (!cwd) {
    return (
      <EmptyState
        icon={<Folder size={28} strokeWidth={1.4} aria-hidden="true" />}
        title={t("rightSidebar.empty.noProject")}
      />
    );
  }

  if (loading && !scan) {
    return (
      <EmptyState
        icon={<Loader2 size={28} strokeWidth={1.4} className="spin" aria-hidden="true" />}
        title={t("rightSidebar.empty.loadingChanges")}
      />
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: "var(--text-muted)" }}>
        <div style={{ color: "var(--text)", marginBottom: 6 }}>{t("rightSidebar.empty.error")}</div>
        <code style={{ fontSize: 11, color: "var(--text-dim)" }}>{error}</code>
      </div>
    );
  }

  if (repos.length === 0) {
    return (
      <EmptyState
        icon={<Folder size={28} strokeWidth={1.4} aria-hidden="true" />}
        title={t("rightSidebar.empty.notARepository")}
      />
    );
  }

  if (totalCount === 0) {
    return (
      <EmptyState
        icon={<Check size={28} strokeWidth={1.4} aria-hidden="true" />}
        title={t("rightSidebar.empty.noChanges")}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "6px 10px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          gap: 8,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {translate("rightSidebar.tabs.changes")}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{totalCount}</span>
        <span style={{ flex: 1 }} />
        <Tooltip content={t("rightSidebar.refreshAria")} side="bottom">
          <button
            type="button"
            onClick={() => void load(cwd)}
            aria-label={t("rightSidebar.refreshAria")}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 24,
              height: 24,
              border: "none",
              background: "transparent",
              color: "var(--text-muted)",
              cursor: loading ? "default" : "pointer",
              padding: 0,
              borderRadius: 4,
            }}
          >
            <RefreshCw size={13} strokeWidth={1.6} className={loading ? "spin" : ""} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {repos.map((repo) => (
          <RepoSection key={repo.root} repo={repo} onOpenFile={onOpenFile} />
        ))}
      </div>
    </div>
  );
}

function RepoSection({ repo, onOpenFile }: { repo: Repository; onOpenFile?: (filePath: string, fileName: string) => void }) {
  const [collapsed, setCollapsed] = useState(false);

  const summary = useMemo(() => {
    const parts: string[] = [];
    const c = repo.counts;
    if (c.modified) parts.push(`${c.modified}M`);
    if (c.added) parts.push(`${c.added}A`);
    if (c.deleted) parts.push(`${c.deleted}D`);
    if (c.renamed) parts.push(`${c.renamed}R`);
    if (c.untracked) parts.push(`${c.untracked}U`);
    if (c.conflict) parts.push(`${c.conflict}C`);
    return parts.join(" ");
  }, [repo.counts]);

  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "6px 10px",
          border: "none",
          background: "transparent",
          color: "var(--text)",
          cursor: "pointer",
          textAlign: "left",
          fontSize: 12,
          fontWeight: 600,
        }}
        aria-expanded={!collapsed}
      >
        <ChevronRight
          size={12}
          strokeWidth={1.8}
          style={{ transform: collapsed ? "none" : "rotate(90deg)", transition: "transform var(--dur-fast) var(--ease-out-warm)", flexShrink: 0 }}
          aria-hidden="true"
        />
        {collapsed ? <Folder size={14} strokeWidth={1.6} aria-hidden="true" /> : <FolderOpen size={14} strokeWidth={1.6} aria-hidden="true" />}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{repo.name}</span>
        <span style={{ color: "var(--text-dim)", fontSize: 11, fontWeight: 500 }}>{repo.relativeRoot === "." ? "" : repo.relativeRoot}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{summary}</span>
      </button>
      {!collapsed && (
        <div style={{ paddingBottom: 4 }}>
          {repo.files.map((file) => (
            <ChangeRow key={file.filePath} file={file} repoRoot={repo.root} onOpenFile={onOpenFile} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChangeRow({ file, repoRoot, onOpenFile }: { file: GitFileStatus; repoRoot: string; onOpenFile?: (filePath: string, fileName: string) => void }) {
  const relative = useMemo(() => {
    return getRelativeFilePath(file.filePath, repoRoot) || file.filePath;
  }, [file.filePath, repoRoot]);

  const handleOpen = useCallback(() => {
    if (file.status === "deleted" || file.status === "conflict") return;
    onOpenFile?.(file.filePath, getFileName(file.filePath));
  }, [file.filePath, file.status, onOpenFile]);

  return (
    <div
      onClick={handleOpen}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 14px 3px 28px",
        cursor: file.status === "deleted" || file.status === "conflict" ? "default" : "pointer",
        fontSize: 12,
        color: "var(--text)",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <span
        aria-hidden="true"
        title={file.status}
        style={{
          display: "inline-block",
          width: 14,
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          color: STATUS_COLOR[file.status],
          textAlign: "center",
        }}
      >
        {STATUS_LABEL[file.status]}
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }} aria-hidden="true">

        {getFileIcon(relative, 13)}
      </span>

      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
        }}
      >
        {relative}
      </span>
    </div>
  );
}

function EmptyState({ icon, title }: { icon: React.ReactNode; title: string }) {
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
      {icon}
      <span style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 220, lineHeight: 1.5 }}>{title}</span>
    </div>
  );
}
