"use client";

/**
 * Create-project dialog. Composes the existing DirectoryPicker (folder
 * selection) with name + description fields. Calls the extended
 * POST /api/projects with { cwd, name, description } — the server validates
 * the cwd, writes `.omp/project.json`, registers the project, and returns
 * the annotated ManagedProject. Idempotent (D17): re-creating an existing
 * project restores its metadata.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { DirectoryPicker } from "./DirectoryPicker";
import { Dialog, DialogContent, DialogTitle } from "./ui/primitives";
import { useI18n } from "@/lib/i18n";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  error: string | null;
  onSubmit: (input: { cwd: string; name: string; description: string }) => void | Promise<void>;
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash < 0 ? normalized : normalized.slice(lastSlash + 1);
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  busy,
  error,
  onSubmit,
}: CreateProjectDialogProps) {
  const { t } = useI18n();
  const [folder, setFolder] = useState("");
  const [name, setName] = useState("");
  const [nameDirty, setNameDirty] = useState(false);
  const [description, setDescription] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const nameFieldId = useId();
  const folderFieldId = useId();
  const descriptionFieldId = useId();

  // When the user picks a folder, pre-fill the name with the basename unless
  // they've already edited it manually (D23: default visible + required).
  useEffect(() => {
    if (!folder || nameDirty) return;
    setName(basename(folder));
  }, [folder, nameDirty]);

  // Reset state when the dialog closes so the next open starts clean.
  useEffect(() => {
    if (open) return;
    setFolder("");
    setName("");
    setNameDirty(false);
    setDescription("");
    setPickerOpen(false);
  }, [open]);

  // Autofocus the name field on open for fast keyboard entry.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => nameInputRef.current?.focus());
  }, [open]);

  const folderMissing = folder.trim().length === 0;
  const nameMissing = name.trim().length === 0;
  const canSubmit = !folderMissing && !nameMissing && !busy;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    void onSubmit({ cwd: folder.trim(), name: name.trim(), description: description.trim() });
  }, [canSubmit, onSubmit, folder, name, description]);

  const submitLabel = useMemo(
    () => (busy ? t("projects.create.submitting") : t("projects.create.submit")),
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
            setFolder(path);
            setPickerOpen(false);
          }}
        />
      )}
      <DialogContent ariaLabel={t("projects.create.title")}>
        <DialogTitle>{t("projects.create.title")}</DialogTitle>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          <label htmlFor={nameFieldId} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {t("projects.create.nameLabel")}
            </span>
            <input
              ref={nameInputRef}
              id={nameFieldId}
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setNameDirty(true);
              }}
              placeholder={t("projects.create.namePlaceholder")}
              required
              disabled={busy}
              style={{
                padding: "8px 10px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-control)",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: 13,
              }}
            />
            {nameMissing && (
              <span style={{ fontSize: 11, color: "var(--status-error)" }}>
                {t("projects.create.nameRequired")}
              </span>
            )}
          </label>

          <label htmlFor={folderFieldId} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {t("projects.create.folderLabel")}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                id={folderFieldId}
                type="text"
                value={folder}
                onChange={(event) => setFolder(event.target.value)}
                placeholder={t("projects.create.folderPlaceholder")}
                disabled={busy}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-control)",
                  background: "var(--bg)",
                  color: "var(--text)",
                  fontSize: 13,
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
                {t("projects.create.folderBrowse")}
              </button>
            </div>
            {folderMissing && (
              <span style={{ fontSize: 11, color: "var(--status-error)" }}>
                {t("projects.create.folderRequired")}
              </span>
            )}
          </label>

          <label htmlFor={descriptionFieldId} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {t("projects.create.descriptionLabel")}
            </span>
            <textarea
              id={descriptionFieldId}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("projects.create.descriptionPlaceholder")}
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
              {t("projects.create.cancel")}
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
