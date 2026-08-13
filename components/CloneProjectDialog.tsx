"use client";

/**
 * Clone a git repository as a new custom project (D21). Pre-fills the
 * folder name from the URL's basename (stripping `.git`); the parent folder
 * is picked via DirectoryPicker. Calls POST /api/projects/clone with
 * `{ url, folderName, parentPath, description? }`. On success, chains into
 * the create-project flow on the cloned folder (the server handles the
 * `.omp/project.json` write + registry insert in one step).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { DirectoryPicker } from "./DirectoryPicker";
import { Dialog, DialogContent, DialogTitle } from "./ui/primitives";
import { useI18n } from "@/lib/i18n";

interface CloneProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  error: string | null;
  onSubmit: (input: {
    url: string;
    folderName: string;
    parentPath: string;
    description: string;
  }) => void | Promise<void>;
}

function basenameFromUrl(url: string): string {
  const trimmed = url.trim().replace(/\.git$/i, "");
  const last = trimmed.split("/").pop() ?? "";
  return last.replace(/[^A-Za-z0-9._-]/g, "-");
}

export function CloneProjectDialog({
  open,
  onOpenChange,
  busy,
  error,
  onSubmit,
}: CloneProjectDialogProps) {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [folderName, setFolderName] = useState("");
  const [folderNameDirty, setFolderNameDirty] = useState(false);
  const [parentPath, setParentPath] = useState("");
  const [description, setDescription] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const urlFieldId = useId();
  const folderFieldId = useId();
  const parentFieldId = useId();
  const descriptionFieldId = useId();

  // Pre-fill the folder name from the URL basename unless the user has
  // already edited it manually.
  useEffect(() => {
    if (!url || folderNameDirty) return;
    setFolderName(basenameFromUrl(url));
  }, [url, folderNameDirty]);

  // Reset on close.
  useEffect(() => {
    if (open) return;
    setUrl("");
    setFolderName("");
    setFolderNameDirty(false);
    setParentPath("");
    setDescription("");
    setPickerOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => urlInputRef.current?.focus());
  }, [open]);

  const urlMissing = url.trim().length === 0;
  const folderMissing = folderName.trim().length === 0;
  const parentMissing = parentPath.trim().length === 0;
  const canSubmit = !urlMissing && !folderMissing && !parentMissing && !busy;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    void onSubmit({
      url: url.trim(),
      folderName: folderName.trim(),
      parentPath: parentPath.trim(),
      description: description.trim(),
    });
  }, [canSubmit, onSubmit, url, folderName, parentPath, description]);

  const submitLabel = useMemo(
    () => (busy ? t("projects.clone.submitting") : t("projects.clone.submit")),
    [busy, t],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {pickerOpen && (
        <DirectoryPicker
          busy={busy}
          error={null}
          onCancel={() => setPickerOpen(false)}
          onSelect={(path) => {
            setParentPath(path);
            setPickerOpen(false);
          }}
        />
      )}
      <DialogContent ariaLabel={t("projects.clone.title")}>
        <DialogTitle>{t("projects.clone.title")}</DialogTitle>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          <label htmlFor={urlFieldId} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {t("projects.clone.urlLabel")}
            </span>
            <input
              ref={urlInputRef}
              id={urlFieldId}
              type="text"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder={t("projects.clone.urlPlaceholder")}
              required
              disabled={busy}
              style={{
                padding: "8px 10px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-control)",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: 13,
                fontFamily: "var(--font-mono)",
              }}
            />
            {urlMissing && (
              <span style={{ fontSize: 11, color: "var(--status-error)" }}>
                {t("projects.clone.urlRequired")}
              </span>
            )}
          </label>

          <label htmlFor={folderFieldId} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {t("projects.clone.folderLabel")}
            </span>
            <input
              id={folderFieldId}
              type="text"
              value={folderName}
              onChange={(event) => {
                setFolderName(event.target.value);
                setFolderNameDirty(true);
              }}
              placeholder={t("projects.clone.folderPlaceholder")}
              required
              disabled={busy}
              style={{
                padding: "8px 10px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-control)",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: 13,
                fontFamily: "var(--font-mono)",
              }}
            />
            {folderMissing && (
              <span style={{ fontSize: 11, color: "var(--status-error)" }}>
                {t("projects.clone.folderRequired")}
              </span>
            )}
          </label>

          <label htmlFor={parentFieldId} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {t("projects.clone.parentLabel")}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                id={parentFieldId}
                type="text"
                value={parentPath}
                onChange={(event) => setParentPath(event.target.value)}
                placeholder={t("projects.clone.parentPlaceholder")}
                disabled={busy}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-control)",
                  background: "var(--bg)",
                  color: "var(--text)",
                  fontSize: 13,
                  fontFamily: "var(--font-mono)",
                }}
              />
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                disabled={busy}
                style={{
                  padding: "8px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-control)",
                  background: "var(--bg-hover)",
                  color: "var(--text)",
                  fontSize: 13,
                  cursor: busy ? "default" : "pointer",
                }}
              >
                {t("projects.clone.parentBrowse")}
              </button>
            </div>
            {parentMissing && (
              <span style={{ fontSize: 11, color: "var(--status-error)" }}>
                {t("projects.clone.parentRequired")}
              </span>
            )}
          </label>

          <label htmlFor={descriptionFieldId} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {t("projects.clone.descriptionLabel")}
            </span>
            <textarea
              id={descriptionFieldId}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={busy}
              rows={3}
              style={{
                padding: "8px 10px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-control)",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: 13,
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
          </label>

          {error && (
            <div style={{ fontSize: 12, color: "var(--status-error)" }}>{error}</div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={busy}
              style={{
                padding: "8px 14px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-control)",
                background: "transparent",
                color: "var(--text)",
                fontSize: 13,
                cursor: busy ? "default" : "pointer",
              }}
            >
              {t("projects.clone.cancel")}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                padding: "8px 14px",
                border: "none",
                borderRadius: "var(--radius-control)",
                background: canSubmit ? "var(--accent)" : "var(--bg-hover)",
                color: canSubmit ? "var(--accent-fg, var(--bg))" : "var(--text-dim)",
                fontSize: 13,
                fontWeight: 600,
                cursor: canSubmit ? "pointer" : "default",
              }}
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
