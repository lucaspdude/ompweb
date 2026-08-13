"use client";

/**
 * Edit an existing project's metadata. Pre-filled from the current values.
 * Calls PATCH /api/projects with `{ cwd, name, description, archived }`.
 * Folder is intentionally immutable — the dialog does not expose it (D20).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "./ui/primitives";
import { useI18n } from "@/lib/i18n";

interface EditProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  error: string | null;
  project: { path: string; name: string; description: string; archived: boolean };
  onSubmit: (input: {
    name: string;
    description: string;
    archived: boolean;
  }) => void | Promise<void>;
}

export function EditProjectDialog({
  open,
  onOpenChange,
  busy,
  error,
  project,
  onSubmit,
}: EditProjectDialogProps) {
  const { t } = useI18n();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [archived, setArchived] = useState(project.archived);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const nameFieldId = useId();
  const descriptionFieldId = useId();

  // Re-seed the form whenever the dialog opens against a different project.
  useEffect(() => {
    if (!open) return;
    setName(project.name);
    setDescription(project.description);
    setArchived(project.archived);
    requestAnimationFrame(() => nameInputRef.current?.focus());
  }, [open, project.name, project.description, project.archived]);

  const nameMissing = name.trim().length === 0;
  const canSubmit = !nameMissing && !busy;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    void onSubmit({ name: name.trim(), description: description.trim(), archived });
  }, [canSubmit, onSubmit, name, description, archived]);

  const submitLabel = useMemo(
    () => (busy ? t("projects.edit.saving") : t("projects.edit.save")),
    [busy, t],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ariaLabel={t("projects.edit.title")}>
        <DialogTitle>{t("projects.edit.title")}</DialogTitle>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          <label htmlFor={nameFieldId} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {t("projects.edit.nameLabel")}
            </span>
            <input
              ref={nameInputRef}
              id={nameFieldId}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
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
                {t("projects.edit.nameRequired")}
              </span>
            )}
          </label>

          <label htmlFor={descriptionFieldId} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {t("projects.edit.descriptionLabel")}
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

          <label style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <input
              type="checkbox"
              checked={archived}
              onChange={(event) => setArchived(event.target.checked)}
              disabled={busy}
              style={{ marginTop: 3 }}
            />
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 13, color: "var(--text)" }}>
                {t("projects.edit.archive")}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>
                {t("projects.edit.archiveDesc")}
              </span>
            </span>
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
              {t("projects.edit.cancel")}
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
